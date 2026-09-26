/**
 * Centralized Financial Year Utility (April 1 to March 31)
 */

function getFinancialYear(inputDate = new Date()) {
  const d = new Date(inputDate)
  if (isNaN(d.getTime())) return getFinancialYear(new Date())

  const month = d.getMonth() // 0-indexed (0 = Jan, 3 = Apr)
  const year = d.getFullYear()

  let startYear, endYear
  if (month >= 3) {
    startYear = year
    endYear = year + 1
  } else {
    startYear = year - 1
    endYear = year
  }

  const endYearShort = String(endYear).slice(-2)
  return `${startYear}-${endYearShort}`
}

function getFinancialYearStart(inputDate = new Date()) {
  const d = new Date(inputDate)
  if (isNaN(d.getTime())) return getFinancialYearStart(new Date())

  const month = d.getMonth()
  const year = d.getFullYear()
  const startYear = month >= 3 ? year : year - 1

  const startDate = new Date(startYear, 3, 1, 0, 0, 0, 0) // April 1st 00:00:00
  return startDate
}

function getFinancialYearEnd(inputDate = new Date()) {
  const d = new Date(inputDate)
  if (isNaN(d.getTime())) return getFinancialYearEnd(new Date())

  const month = d.getMonth()
  const year = d.getFullYear()
  const endYear = month >= 3 ? year + 1 : year

  const endDate = new Date(endYear, 2, 31, 23, 59, 59, 999) // March 31st 23:59:59.999
  return endDate
}

module.exports = {
  getFinancialYear,
  getFinancialYearStart,
  getFinancialYearEnd,
}
