/**
 * Central IMEI Validation Utility
 * Rule: Exactly 15 numeric digits (0-9).
 */

const IMEI_REGEX = /^\d{15}$/

/**
 * Validates if a string is a valid 15-digit numeric IMEI.
 * @param {string|number} value 
 * @returns {boolean}
 */
const isValidIMEI = (value) => {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  return IMEI_REGEX.test(str)
}

/**
 * Validates an array of IMEIs. All elements must be valid 15-digit IMEIs.
 * @param {Array<string|number>} array 
 * @returns {boolean}
 */
const areValidIMEIs = (array) => {
  if (!Array.isArray(array) || array.length === 0) return false
  return array.every(item => isValidIMEI(item))
}

module.exports = {
  IMEI_REGEX,
  isValidIMEI,
  areValidIMEIs
}
