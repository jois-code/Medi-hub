import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, COLLECTIONS, Timestamp } from '../config/firebase.js';
import { authenticate, requireRole, requireVerifiedDoctor } from '../middleware/auth.middleware.js';
import { validate, schemas } from '../middleware/validate.middleware.js';
import { createNotification } from '../services/notification.service.js';

const router = Router();
router.use(authenticate);

/**
 * POST /api/appointments
 * Doctor creates an appointment for a patient they have approved access to
 */
router.post(
  '/',
  requireRole('doctor'),
  requireVerifiedDoctor,
  validate(schemas.createAppointment),
  async (req, res) => {
    try {
      const { patientId, dateTime, duration = 30, type, notes } = req.body;
      const doctorId = req.user.uid;

      // Verify doctor has approved access to patient
      const accessSnap = await db.collection(COLLECTIONS.ACCESS_REQUESTS)
        .where('doctorId', '==', doctorId)
        .where('patientId', '==', patientId)
        .where('status', '==', 'approved')
        .where('isExpired', '==', false)
        .limit(1)
        .get();

      if (accessSnap.empty) {
        return res.status(403).json({ error: 'You do not have approved access to this patient.' });
      }

      const id = uuidv4();
      const appointment = {
        id,
        patientId,
        doctorId,
        dateTime: Timestamp.fromDate(new Date(dateTime)),
        duration,
        type,
        notes: notes || '',
        status: 'scheduled',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection(COLLECTIONS.APPOINTMENTS).doc(id).set(appointment);

      // Notify patient
      const doctorName = req.user.displayName || 'Your doctor';
      await createNotification({
        recipientId: patientId,
        type: 'appointment',
        title: 'New Appointment Scheduled',
        body: `${doctorName} has scheduled a ${type} appointment on ${new Date(dateTime).toLocaleDateString('en-IN')}.`,
        metadata: { appointmentId: id, doctorId },
      });

      res.status(201).json({ appointment });
    } catch (err) {
      console.error('create appointment error:', err.message);
      res.status(500).json({ error: 'Failed to create appointment.' });
    }
  }
);

/**
 * GET /api/appointments
 * Lists appointments for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const role = req.user.role;
    const { status, from, to } = req.query;

    let query = db.collection(COLLECTIONS.APPOINTMENTS)
      .where(role === 'doctor' ? 'doctorId' : 'patientId', '==', uid)
      .orderBy('dateTime', 'desc');

    const snap = await query.get();
    let appointments = snap.docs.map((d) => d.data());

    if (status) appointments = appointments.filter((a) => a.status === status);
    if (from) appointments = appointments.filter((a) => a.dateTime.toMillis() >= new Date(from).getTime());
    if (to) appointments = appointments.filter((a) => a.dateTime.toMillis() <= new Date(to).getTime());

    res.json({ appointments });
  } catch (err) {
    console.error('list appointments error:', err.message);
    res.status(500).json({ error: 'Failed to list appointments.' });
  }
});

/**
 * GET /api/appointments/upcoming
 * Returns next 5 upcoming appointments for the user
 */
router.get('/upcoming', async (req, res) => {
  try {
    const uid = req.user.uid;
    const role = req.user.role;
    const now = Timestamp.now();

    const snap = await db.collection(COLLECTIONS.APPOINTMENTS)
      .where(role === 'doctor' ? 'doctorId' : 'patientId', '==', uid)
      .where('dateTime', '>=', now)
      .where('status', 'in', ['scheduled', 'confirmed'])
      .orderBy('dateTime', 'asc')
      .limit(5)
      .get();

    const appointments = snap.docs.map((d) => d.data());
    res.json({ appointments });
  } catch (err) {
    console.error('upcoming appointments error:', err.message);
    res.status(500).json({ error: 'Failed to fetch upcoming appointments.' });
  }
});

/**
 * PATCH /api/appointments/:id/status
 * Update appointment status
 */
router.patch('/:id/status', validate(schemas.updateAppointmentStatus), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const uid = req.user.uid;
    const role = req.user.role;

    const ref = db.collection(COLLECTIONS.APPOINTMENTS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Appointment not found.' });

    const appt = snap.data();

    // Authorization: both doctor and patient can cancel; only doctor can mark completed/no_show
    const isDoctor = role === 'doctor' && appt.doctorId === uid;
    const isPatient = role === 'patient' && appt.patientId === uid;

    if (!isDoctor && !isPatient) return res.status(403).json({ error: 'Forbidden.' });
    if ((status === 'completed' || status === 'no_show') && !isDoctor) {
      return res.status(403).json({ error: 'Only the doctor can mark an appointment as completed or no-show.' });
    }

    await ref.update({ status, updatedAt: Timestamp.now() });

    // Notify the other party
    const notifyId = isDoctor ? appt.patientId : appt.doctorId;
    const actorName = req.user.displayName || (isDoctor ? 'Your doctor' : 'Patient');
    const statusLabel = { confirmed: 'confirmed', cancelled: 'cancelled', completed: 'completed', no_show: 'marked as no-show' }[status] || status;

    await createNotification({
      recipientId: notifyId,
      type: 'appointment',
      title: `Appointment ${statusLabel}`,
      body: `${actorName} has ${statusLabel} your appointment.`,
      metadata: { appointmentId: id },
    });

    res.json({ success: true, status });
  } catch (err) {
    console.error('update appointment status error:', err.message);
    res.status(500).json({ error: 'Failed to update appointment status.' });
  }
});

export default router;
