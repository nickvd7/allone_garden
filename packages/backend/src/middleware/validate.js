/**
 * Input validation helpers.
 * Uses express-validator to define reusable rule chains,
 * and a handleValidationErrors middleware to return 400 on failure.
 */
const { body, param, validationResult } = require('express-validator');

/**
 * Call after a validation chain — returns 400 with the first error
 * if validation fails, otherwise calls next().
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

// ── Auth validators ───────────────────────────────────────────────────────────

const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3–30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username may only contain letters, numbers, _ and -'),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  handleValidationErrors,
];

const validateLogin = [
  body('username').trim().isLength({ min: 1 }).withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

// ── Garden validators ─────────────────────────────────────────────────────────

const VALID_PLANT_TYPES = [
  'tomato', 'carrot', 'lettuce', 'radish', 'corn',
  'potato', 'pumpkin', 'sunflower', 'blueberry',
];
const VALID_ACTIONS  = ['till', 'plant', 'water', 'fertilize', 'spray', 'harvest'];
const VALID_WEATHERS = ['sunny', 'cloudy', 'rainy', 'windy', 'storm', 'drought'];

const validateGardenAction = [
  body('type')
    .isIn(VALID_ACTIONS)
    .withMessage(`Action must be one of: ${VALID_ACTIONS.join(', ')}`),

  body('plotIndex')
    .isInt({ min: 0, max: 99 })
    .withMessage('plotIndex must be 0–99'),

  body('payload.plantType')
    .optional()
    .isIn(VALID_PLANT_TYPES)
    .withMessage(`Plant type must be one of: ${VALID_PLANT_TYPES.join(', ')}`),

  handleValidationErrors,
];

const validateGardenSave = [
  body('plots')
    .isArray({ min: 1, max: 100 })
    .withMessage('plots must be an array of 1–100 items'),

  // Per-plot field validation — prevents clients from sending cheat values
  body('plots.*')
    .custom((plot) => {
      if (typeof plot !== 'object' || plot === null || Array.isArray(plot)) {
        throw new Error('Each plot must be an object');
      }
      if (plot.tilled !== undefined && typeof plot.tilled !== 'boolean') {
        throw new Error('plot.tilled must be boolean');
      }
      if (plot.planted !== undefined && typeof plot.planted !== 'boolean') {
        throw new Error('plot.planted must be boolean');
      }
      if (plot.fertilized !== undefined && typeof plot.fertilized !== 'boolean') {
        throw new Error('plot.fertilized must be boolean');
      }
      if (plot.pest !== undefined && typeof plot.pest !== 'boolean') {
        throw new Error('plot.pest must be boolean');
      }
      if (plot.waterLevel !== undefined) {
        const wl = Number(plot.waterLevel);
        if (!Number.isInteger(wl) || wl < 0 || wl > 3) {
          throw new Error('plot.waterLevel must be an integer 0–3');
        }
      }
      if (plot.daysPlanted !== undefined) {
        const dp = Number(plot.daysPlanted);
        if (!Number.isInteger(dp) || dp < 0 || dp > 9999) {
          throw new Error('plot.daysPlanted must be an integer 0–9999');
        }
      }
      if (plot.plantType !== undefined && plot.plantType !== null) {
        if (!VALID_PLANT_TYPES.includes(plot.plantType)) {
          throw new Error(`plot.plantType must be one of: ${VALID_PLANT_TYPES.join(', ')}`);
        }
      }
      return true;
    }),

  body('currentDay')
    .optional()
    .isInt({ min: 1, max: 999999 })
    .withMessage('currentDay must be a positive integer'),

  body('weather')
    .optional()
    .isIn(VALID_WEATHERS)
    .withMessage(`weather must be one of: ${VALID_WEATHERS.join(', ')}`),

  body('ifUnmodifiedSince')
    .optional()
    .isISO8601()
    .withMessage('ifUnmodifiedSince must be a valid ISO-8601 date'),

  handleValidationErrors,
];

// ── Trade validators ──────────────────────────────────────────────────────────

const validateCreateListing = [
  body('cropId')
    .isIn(VALID_PLANT_TYPES)
    .withMessage(`cropId must be one of: ${VALID_PLANT_TYPES.join(', ')}`),

  body('quantity')
    .isInt({ min: 1, max: 999 })
    .withMessage('quantity must be 1–999'),

  body('pricePerUnit')
    .isInt({ min: 1, max: 100000 })
    .withMessage('pricePerUnit must be 1–100000'),

  handleValidationErrors,
];

const validateBuy = [
  param('listingId')
    .isInt({ min: 1 })
    .withMessage('Invalid listing ID'),

  body('quantity')
    .optional()
    .isInt({ min: 1, max: 999 })
    .withMessage('quantity must be 1–999'),

  handleValidationErrors,
];

// ── Chat validator (server-side, for REST; Socket.IO uses sanitizeMessage) ────

const validateChatMessage = [
  body('text')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be 1–500 characters'),

  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateGardenAction,
  validateGardenSave,
  validateCreateListing,
  validateBuy,
  validateChatMessage,
  VALID_PLANT_TYPES,
  VALID_ACTIONS,
  VALID_WEATHERS,
};
