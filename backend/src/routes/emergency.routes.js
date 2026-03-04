import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, COLLECTIONS, Timestamp, FieldValue } from '../config/firebase.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validate, schemas } from '../middleware/validate.middleware.js';

const router = Router();

/**
 * POST /api/emergency/generate
 * Authenticated patient generates a temporary emergency access token
 */
router.post('/generate', authenticate, requireRole('patient'), validate(schemas.generateEmergencyToken), async (req, res) => {
  try {
    const { expiryHours = 24, label } = req.body;
    const patientId = req.user.uid;
    const tokenId = uuidv4();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + expiryHours * 60 * 60 * 1000);

    const tokenDoc = {
      tokenId,
      patientId,
      label: label || `Emergency Token — ${new Date().toLocaleDateString('en-IN')}`,
      createdAt: now,
      expiresAt,
      accessedBy: [],
      isRevoked: false,
    };

    await db.collection(COLLECTIONS.EMERGENCY_TOKENS).doc(tokenId).set(tokenDoc);

    res.status(201).json({
      token: tokenDoc,
      accessUrl: `/emergency-access/${tokenId}`,
    });
  } catch (err) {
    console.error('generate emergency token error:', err.message);
    res.status(500).json({ error: 'Failed to generate emergency token.' });
  }
});

/**
 * GET /api/emergency/tokens
 * Authenticated patient lists their active emergency tokens
 */
router.get('/tokens', authenticate, requireRole('patient'), async (req, res) => {
  try {
    const snap = await db.collection(COLLECTIONS.EMERGENCY_TOKENS)
      .where('patientId', '==', req.user.uid)
      .where('isRevoked', '==', false)
      .orderBy('createdAt', 'desc')
      .get();

    const tokens = snap.docs.map((d) => d.data());
    res.json({ tokens });
  } catch (err) {
    console.error('list emergency tokens error:', err.message);
    res.status(500).json({ error: 'Failed to list tokens.' });
  }
});

/**
 * DELETE /api/emergency/tokens/:tokenId
 * Authenticated patient revokes a token
 */
router.delete('/tokens/:tokenId', authenticate, requireRole('patient'), async (req, res) => {
  try {
    const ref = db.collection(COLLECTIONS.EMERGENCY_TOKENS).doc(req.params.tokenId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Token not found.' });
    if (snap.data().patientId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    await ref.update({ isRevoked: true });
    res.json({ success: true });
  } catch (err) {
    console.error('revoke emergency token error:', err.message);
    res.status(500).json({ error: 'Failed to revoke token.' });
  }
});

/**
 * GET /api/emergency/access/:token
 * Public endpoint — returns limited patient info for emergency use
 */
router.get('/access/:token', async (req, res) => {
  try {
    const snap = await db.collection(COLLECTIONS.EMERGENCY_TOKENS).doc(req.params.token).get();
    if (!snap.exists) return res.status(404).json({ error: 'Token not found.' });

    const tokenData = snap.data();
    const now = Timestamp.now();

    if (tokenData.isRevoked) return res.status(410).json({ error: 'Token has been revoked.' });
    if (tokenData.expiresAt.toMillis() < now.toMillis()) {
      return res.status(410).json({ error: 'Token has expired.' });
    }

    // Log access
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    await snap.ref.update({
      accessedBy: FieldValue.arrayUnion({ ip, accessedAt: now }),
    });

    // Fetch patient profile
    const [patientSnap, recordsSnap] = await Promise.all([
      db.collection(COLLECTIONS.PATIENTS).doc(tokenData.patientId).get(),
      db.collection(COLLECTIONS.RECORDS)
        .where('patientId', '==', tokenData.patientId)
        .where('isArchived', '==', false)
        .where('recordType', 'in', ['prescription', 'vaccination'])
        .orderBy('updatedAt', 'desc')
        .limit(10)
        .get(),
    ]);

    const patient = patientSnap.exists ? patientSnap.data() : {};
    const records = recordsSnap.docs.map((d) => {
      const r = d.data();
      return {
        id: r.id,
        title: r.title,
        recordType: r.recordType,
        issuedBy: r.issuedBy,
        issuedDate: r.issuedDate,
        tags: r.tags,
        updatedAt: r.updatedAt,
      };
    });

    res.json({
      patient: {
        displayName: patient.displayName,
        bloodGroup: patient.bloodGroup,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        emergencyContact: patient.emergencyContact,
        allergies: patient.allergies,
      },
      criticalRecords: records,
      tokenLabel: tokenData.label,
      expiresAt: tokenData.expiresAt,
    });
  } catch (err) {
    console.error('emergency access error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emergency info.' });
  }
});

export default router;
