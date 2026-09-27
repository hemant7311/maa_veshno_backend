/**
 * Central Indian Mobile Number Validation Utility
 * Rule: Exactly 10 numeric digits starting with 6, 7, 8, or 9.
 */

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/

/**
 * Validates if a string is a valid 10-digit Indian mobile number.
 * @param {string|number} value 
 * @returns {boolean}
 */
const isValidIndianMobile = (value) => {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  return INDIAN_MOBILE_REGEX.test(str)
}

/**
 * Normalizes a mobile number string by trimming.
 * Strips leading +91 or 91 if present only if it leaves a 10-digit number starting with 6-9.
 * @param {string|number} value 
 * @returns {string}
 */
const normalizeMobile = (value) => {
  if (!value) return ''
  let str = String(value).trim()
  if (str.startsWith('+91') && str.length === 13) {
    str = str.slice(3)
  } else if (str.startsWith('91') && str.length === 12 && /^[6-9]/.test(str.slice(2))) {
    str = str.slice(2)
  }
  return str
}

module.exports = {
  INDIAN_MOBILE_REGEX,
  isValidIndianMobile,
  normalizeMobile
}
