import { Router } from 'express';
import { db, COLLECTIONS, FieldValue } from '../config/firebase.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate, schemas } from '../middleware/validate.middleware.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/settings/profile
 * Get full profile with preferences
 */
router.get('/profile', async (req, res) => {
  try {
    const uid = req.user.uid;
    const role = req.user.role;
    const collection = role === 'patient' ? COLLECTIONS.PATIENTS : COLLECTIONS.DOCTORS;

    const [userSnap, profileSnap] = await Promise.all([
      db.collection(COLLECTIONS.USERS).doc(uid).get(),
      db.collection(collection).doc(uid).get(),
    ]);

    const user = userSnap.exists ? userSnap.data() : {};
    const profile = profileSnap.exists ? profileSnap.data() : {};

    res.json({
      profile: {
        uid,
        email: req.user.email,
        role,
        displayName: user.displayName || profile.displayName,
        phone: profile.phone,
        preferences: user.preferences || {},
        lastLogin: user.lastLogin,
        ...(role === 'patient' ? {
          dateOfBirth: profile.dateOfBirth,
          gender: profile.gender,
          bloodGroup: profile.bloodGroup,
          emergencyContact: profile.emergencyContact,
        } : {
          specialization: profile.specialization,
          licenseNumber: profile.licenseNumber,
          hospitalAffiliations: profile.hospitalAffiliations,
          yearsOfExperience: profile.yearsOfExperience,
        }),
      },
    });
  } catch (err) {
    console.error('get profile error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

/**
 * PATCH /api/settings/profile
 * Update display name and optional profile fields
 */
router.patch('/profile', validate(schemas.updateProfile), async (req, res) => {
  try {
    const uid = req.user.uid;
    const role = req.user.role;
    const { displayName, phone, emergencyContact } = req.body;
    const collection = role === 'patient' ? COLLECTIONS.PATIENTS : COLLECTIONS.DOCTORS;

    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (phone !== undefined) updates.phone = phone;
    if (emergencyContact !== undefined && role === 'patient') updates.emergencyContact = emergencyContact;

    if (Object.keys(updates).length === 0) {
      return res.status(422).json({ error: 'No fields to update.' });
    }

    await Promise.all([
      db.collection(COLLECTIONS.USERS).doc(uid).update(updates),
      db.collection(collection).doc(uid).update(updates),
    ]);

    res.json({ success: true, updated: Object.keys(updates) });
  } catch (err) {
    console.error('update profile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

/**
 * PATCH /api/settings/preferences
 * Update notification preferences
 */
router.patch('/preferences', validate(schemas.updatePreferences), async (req, res) => {
  try {
    const uid = req.user.uid;
    const { emailNotifications } = req.body;

    await db.collection(COLLECTIONS.USERS).doc(uid).update({
      'preferences.emailNotifications': emailNotifications,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('update preferences error:', err.message);
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
});

export default router;
