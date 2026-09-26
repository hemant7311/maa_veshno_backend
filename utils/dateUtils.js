/**
 * Reusable India Business Date Boundary Utility (IST - UTC+05:30)
 * Prevents UTC midnight shift and date boundary errors across all servers.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function getISTParts(dateInput = new Date()) {
  const d = new Date(dateInput)
  const validDate = isNaN(d.getTime()) ? new Date() : d
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.format(validDate) // 'YYYY-MM-DD'
  const [year, month, day] = parts.split('-').map(Number)
  return { year, month: month - 1, day, dateStr: parts }
}

/**
 * Returns { start, end, dateStr } for a single day in IST 00:00:00.000 to 23:59:59.999
 */
function getIndiaDayBounds(dateInput = new Date()) {
  let year, month, day, dateStr
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const parts = dateInput.trim().split('-').map(Number)
    year = parts[0]
    month = parts[1] - 1
    day = parts[2]
    dateStr = dateInput.trim()
  } else {
    const ist = getISTParts(dateInput)
    year = ist.year
    month = ist.month
    day = ist.day
    dateStr = ist.dateStr
  }

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS)
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - IST_OFFSET_MS)
  return { start, end, dateStr }
}

/**
 * Returns { start, end } for a full month in IST
 */
function getIndiaMonthBounds(dateInput = new Date()) {
  const ist = getISTParts(dateInput)
  const start = new Date(Date.UTC(ist.year, ist.month, 1, 0, 0, 0, 0) - IST_OFFSET_MS)
  const lastDay = new Date(ist.year, ist.month + 1, 0).getDate()
  const end = new Date(Date.UTC(ist.year, ist.month, lastDay, 23, 59, 59, 999) - IST_OFFSET_MS)
  return { start, end }
}

/**
 * Returns { start, end, fyLabel } for the Indian Financial Year (Apr 1 - Mar 31)
 */
function getIndiaFYBounds(dateInput = new Date()) {
  const ist = getISTParts(dateInput)
  const startYear = ist.month >= 3 ? ist.year : ist.year - 1
  const endYear = startYear + 1

  const start = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0) - IST_OFFSET_MS)
  const end = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999) - IST_OFFSET_MS)
  return { start, end, fyLabel: `${startYear}-${String(endYear).slice(-2)}` }
}

module.exports = {
  getISTParts,
  getIndiaDayBounds,
  getIndiaMonthBounds,
  getIndiaFYBounds
}
