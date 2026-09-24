function generateEmiSchedule(tenureStr, emiAmount, startDate, delayMonths = 1, firstEmiDate = null) {
  const match = String(tenureStr).match(/\d+/);
  const tenure = match ? parseInt(match[0], 10) : 6;
  const schedule = [];

  let baseDate = new Date(startDate);
  if (firstEmiDate) {
    baseDate = new Date(firstEmiDate);
  } else {
    baseDate.setMonth(baseDate.getMonth() + delayMonths);
  }

  const baseDay = baseDate.getDate();

  for (let i = 0; i < tenure; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + i, 1);
    const targetMonth = dueDate.getMonth();
    dueDate.setDate(baseDay);
    if (dueDate.getMonth() !== targetMonth) {
      // Handled month-end overflow
      dueDate.setDate(0);
    }

    schedule.push({
      installmentNumber: i + 1,
      dueDate,
      expectedAmount: emiAmount,
      paidAmount: 0,
      remainingAmount: emiAmount,
      status: 'Pending'
    });
  }

  return schedule;
}

module.exports = { generateEmiSchedule };
