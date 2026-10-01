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

function calculateFinanceStats(record) {
  if (!record) return null;
  const doc = typeof record.toObject === 'function' ? record.toObject() : record;
  const installments = doc.installments || [];
  
  let totalScheduledEmiAmount = 0;
  let totalEmiAmountPaid = 0;
  let totalPendingEmiAmount = 0;
  
  let paidInstallmentCount = 0;
  let overdueInstallmentCount = 0;
  let overdueAmount = 0;
  let nextEmiDueDate = null;

  const now = new Date();

  installments.forEach(inst => {
    const expected = Number(inst.expectedAmount) || 0;
    const paid = Number(inst.paidAmount) || 0;
    const remaining = Math.max(0, expected - paid);
    
    totalScheduledEmiAmount += expected;
    totalEmiAmountPaid += paid;
    totalPendingEmiAmount += remaining;

    if (remaining === 0) {
      paidInstallmentCount++;
    } else {
      if (inst.dueDate && new Date(inst.dueDate) < now) {
        overdueInstallmentCount++;
        overdueAmount += remaining;
      }
      
      if (!nextEmiDueDate && inst.dueDate && new Date(inst.dueDate) >= now) {
        nextEmiDueDate = inst.dueDate;
      }
    }
  });

  const totalInstallments = installments.length;
  const pendingInstallmentCount = totalInstallments - paidInstallmentCount;
  
  const dpAmount = Math.max(0, (Number(doc.totalLimit) || 0) - (Number(doc.usedLimit) || 0));

  doc.stats = {
    totalScheduledEmiAmount,
    totalEmiAmountPaid,
    totalPendingEmiAmount,
    totalInstallments,
    paidInstallmentCount,
    pendingInstallmentCount,
    overdueInstallmentCount,
    overdueAmount,
    nextEmiDueDate,
    dpAmount,
    outstandingPrincipal: doc.usedLimit || 0
  };

  return doc;
}

module.exports = { generateEmiSchedule, calculateFinanceStats };
