import { Router } from 'express';
import { db, COLLECTIONS, Timestamp } from '../config/firebase.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/analytics/patient
 * Patient analytics: records by type, upload frequency, storage, access history
 */
router.get('/patient', requireRole('patient'), async (req, res) => {
  try {
    const patientId = req.user.uid;
    const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recordsSnap, commitsSnap, accessSnap] = await Promise.all([
      db.collection(COLLECTIONS.RECORDS).where('patientId', '==', patientId).where('isArchived', '==', false).get(),
      db.collection(COLLECTIONS.COMMITS).where('patientId', '==', patientId).where('createdAt', '>=', thirtyDaysAgo).orderBy('createdAt', 'asc').get(),
      db.collection(COLLECTIONS.ACCESS_REQUESTS).where('patientId', '==', patientId).where('status', '==', 'approved').get(),
    ]);

    // Records by type
    const byType = {};
    let totalSizeBytes = 0;
    recordsSnap.docs.forEach((d) => {
      const r = d.data();
      byType[r.recordType] = (byType[r.recordType] || 0) + 1;
      totalSizeBytes += r.fileSizeBytes || 0;
    });

    // Upload frequency over last 30 days
    const uploadsByDay = {};
    commitsSnap.docs.forEach((d) => {
      const c = d.data();
      const day = new Date(c.createdAt.toMillis()).toISOString().slice(0, 10);
      uploadsByDay[day] = (uploadsByDay[day] || 0) + 1;
    });

    // Doctor access history
    const doctorAccess = accessSnap.docs.map((d) => {
      const r = d.data();
      return { doctorId: r.doctorId, grantedAt: r.updatedAt, expiresAt: r.expiresAt };
    });

    res.json({
      recordsByType: byType,
      totalRecords: recordsSnap.size,
      uploadsByDay,
      totalCommits: commitsSnap.size,
      storageBytes: totalSizeBytes,
      storageMB: +(totalSizeBytes / 1024 / 1024).toFixed(2),
      activeCollaborators: accessSnap.size,
      doctorAccessHistory: doctorAccess,
    });
  } catch (err) {
    console.error('patient analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
});

/**
 * GET /api/analytics/doctor
 * Doctor analytics: patients handled, endorsements breakdown, contribution summary
 */
router.get('/doctor', requireRole('doctor'), async (req, res) => {
  try {
    const doctorId = req.user.uid;
    const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [accessSnap, endorsementsSnap, commitsSnap] = await Promise.all([
      db.collection(COLLECTIONS.ACCESS_REQUESTS).where('doctorId', '==', doctorId).get(),
      db.collection(COLLECTIONS.ENDORSEMENTS).where('targetDoctorId', '==', doctorId).get(),
      db.collection(COLLECTIONS.COMMITS).where('committedById', '==', doctorId).where('createdAt', '>=', thirtyDaysAgo).orderBy('createdAt', 'asc').get(),
    ]);

    // Patients handled over time
    const patientsByStatus = {};
    const patientsByMonth = {};
    accessSnap.docs.forEach((d) => {
      const r = d.data();
      patientsByStatus[r.status] = (patientsByStatus[r.status] || 0) + 1;
      if (r.createdAt) {
        const month = new Date(r.createdAt.toMillis()).toISOString().slice(0, 7);
        patientsByMonth[month] = (patientsByMonth[month] || 0) + 1;
      }
    });

    // Endorsement breakdown by skill
    const endorsementsBySkill = {};
    endorsementsSnap.docs.forEach((d) => {
      const e = d.data();
      endorsementsBySkill[e.skill] = (endorsementsBySkill[e.skill] || 0) + 1;
    });

    // Commits over last 30 days
    const commitsByDay = {};
    commitsSnap.docs.forEach((d) => {
      const c = d.data();
      const day = new Date(c.createdAt.toMillis()).toISOString().slice(0, 10);
      commitsByDay[day] = (commitsByDay[day] || 0) + 1;
    });

    res.json({
      totalPatients: new Set(accessSnap.docs.map((d) => d.data().patientId)).size,
      patientsByStatus,
      patientsByMonth,
      totalEndorsements: endorsementsSnap.size,
      endorsementsBySkill,
      commitsByDay,
      totalCommitsLast30Days: commitsSnap.size,
    });
  } catch (err) {
    console.error('doctor analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
});

export default router;
