/**
 * Canonical Payment Method Mapping Utility
 */

const PAYMENT_MAP = {
  'cash': 'cash',
  'Cash': 'cash',
  'upi': 'upi',
  'UPI': 'upi',
  'online': 'upi',
  'Online': 'upi',
  'bank': 'bank',
  'Bank': 'bank',
  'Bank Transfer': 'bank',
  'cheque': 'cheque',
  'Cheque': 'cheque',
  'check': 'cheque',
  'Check': 'cheque',
  'card': 'card',
  'Card': 'card',
  'credit': 'credit',
  'Credit': 'credit',
  'finance': 'finance',
  'Finance': 'finance',
  'other': 'other',
  'Other': 'other'
}

function normalizePaymentMethod(methodStr) {
  if (!methodStr) return 'cash'
  const trimmed = String(methodStr).trim()
  return PAYMENT_MAP[trimmed] || PAYMENT_MAP[trimmed.toLowerCase()] || 'cash'
}

function getPaymentLabel(canonicalMethod) {
  switch (String(canonicalMethod).toLowerCase()) {
    case 'cash': return 'Cash'
    case 'upi': return 'UPI'
    case 'bank': return 'Bank Transfer'
    case 'cheque': return 'Cheque'
    case 'card': return 'Card'
    case 'credit': return 'Credit'
    case 'finance': return 'Finance'
    default: return 'Other'
  }
}

module.exports = {
  normalizePaymentMethod,
  getPaymentLabel,
  PAYMENT_MAP
}
