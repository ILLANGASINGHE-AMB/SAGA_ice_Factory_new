import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { isCollectedCashSettlement } from '../utils/cashBankMath';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { toLocalDateStr } from '../utils/date';

// Free cubes issued on one sale.
//
// A `sale_items` row flagged `is_free` is authoritative — that is how the
// pooled-order RPC records complimentary stock, split across Production and
// Resell like any other line. `sales.free_quantity` is the fallback for rows
// written before those line items existed.
function freeCubesOn(sale) {
  const fromItems = (sale.sale_items || [])
    .filter(item => item.is_free)
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return fromItems || Number(sale.free_quantity) || 0;
}

const defaultDashboardData = {
  stats: {
    mfcSoldToday: 0,
    rscSoldToday: 0,
    totalCubesSoldToday: 0,
    freeCubesToday: 0,
    totalFreeCubes: 0,
    totalInventory: 0,
    mfcInventory: 0,
    rscInventory: 0,
    totalProductionResellCubes: 0,
    revenueToday: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    monthlyCashFlow: 0,
    totalOutstandingDebts: 0,
    pendingDebtsCount: 0
  },
  charts: {
    monthly: [],
    stockTrend: [],
    pie: [{ name: 'Cash Sales', value: 1 }, { name: 'Debt Sales', value: 0 }]
  },
  totals: {
    monthlyCubesProduction: 0,
    monthlyCubesResell: 0,
    monthlyCubesTotal: 0,
    monthlyCubesFree: 0,
    salesDistributionTotal: 0,
    trendProductionTotal: 0,
    trendPurchaseTotal: 0
  },
  tables: {
    recentSales: [],
    recentDebts: [],
    recentSettlements: []
  }
};

export function useDashboard() {
  const [data, setData] = useState(defaultDashboardData);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const [
        salesList,
        debtsList,
        settlementsList,
        customersList,
        inventoryList,
        stockTxnList
      ] = await Promise.all([
        supabase.from('sales').select('*, sale_items(*)').then(res => res.data || []).catch(() => []),
        supabase.from('debts').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('debt_settlements').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('customers').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('inventory').select('*').then(res => res.data || []).catch(() => []),
        supabase
          .from('inventory_transactions')
          .select('quantity_change, transaction_type, created_at, inventory(type)')
          .then(res => res.data || [])
          .catch(() => [])
      ]);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const custMap = new Map(customersList.map(c => [c.id, c]));
      const salesMap = new Map(salesList.map(s => [s.id, s]));

      let mfcSoldToday = 0;
      let rscSoldToday = 0;
      let freeCubesToday = 0;
      let totalFreeCubes = 0;
      let revenueToday = 0;
      let totalRevenue = 0;
      let monthlyRevenue = 0;
      let monthlyCashSales = 0;

      salesList.forEach(sale => {
        const amt = Number(sale.total_amount) || 0;
        totalRevenue += amt;
        totalFreeCubes += freeCubesOn(sale);

        const saleDate = new Date(sale.sale_date);
        if (saleDate >= startOfToday) {
          (sale.sale_items || []).forEach(item => {
            // Complimentary cubes left the store but were never sold — they
            // earn nothing and are reported on their own card, so counting
            // them here inflated "Sold Today" by every giveaway.
            if (item.is_free) return;
            if (item.cube_type === 'manufactured') {
              mfcSoldToday += Number(item.quantity) || 0;
            } else if (item.cube_type === 'resell') {
              rscSoldToday += Number(item.quantity) || 0;
            }
          });
          freeCubesToday += freeCubesOn(sale);
          revenueToday += amt;
        }

        if (saleDate >= startOfMonth) {
          monthlyRevenue += amt;
          if (sale.payment_type === 'cash') {
            monthlyCashSales += amt;
          }
        }
      });

      const totalCubesSoldToday = mfcSoldToday + rscSoldToday;
      const totalInventory = inventoryList.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const mfcInventory = Number(inventoryList.find(i => i.type === 'manufactured')?.quantity) || 0;
      const rscInventory = Number(inventoryList.find(i => i.type === 'resell')?.quantity) || 0;
      const totalProductionResellCubes = mfcInventory + rscInventory;

      const pendingDebtsCount = debtsList.filter(d => d.status === 'pending' || d.status === 'partial').length;
      const totalOutstandingDebts = debtsList
        .filter(d => d.status === 'pending' || d.status === 'partial')
        .reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0);

      // "Monthly Cash Flow" means money that reached the till. Summing every
      // settlement counted an auto-applied row twice (that cash is already in
      // monthlyCashSales as the sale itself) and counted bank-transfer and
      // cheque settlements that never touched the till at all. The rule lives
      // in cashBankMath so the two can't drift apart again.
      let monthlyDebtSettled = 0;
      settlementsList.forEach(setl => {
        const sDate = new Date(setl.settlement_date);
        if (sDate >= startOfMonth && isCollectedCashSettlement(setl)) {
          monthlyDebtSettled += Number(setl.amount_paid) || 0;
        }
      });
      const monthlyCashFlow = monthlyCashSales + monthlyDebtSettled;

      // 30-day Production/Resell cube sales + daily revenue, in one pass
      // (bar chart and revenue line chart both read this same array).
      const monthlyData = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);

        let dayRev = 0;
        let mfcQty = 0;
        let rscQty = 0;
        let freeQty = 0;
        salesList.forEach(sale => {
          const sDate = new Date(sale.sale_date);
          if (sDate >= dayStart && sDate <= dayEnd) {
            dayRev += Number(sale.total_amount) || 0;
            (sale.sale_items || []).forEach(item => {
              // Free cubes are excluded here for the same reason as the
              // "Sold Today" card: this is a SALES chart, and a bar that
              // silently included giveaways disagreed with the card above it.
              // They are carried alongside as `Free` so nothing is lost.
              if (item.is_free) return;
              if (item.cube_type === 'manufactured') {
                mfcQty += Number(item.quantity) || 0;
              } else if (item.cube_type === 'resell') {
                rscQty += Number(item.quantity) || 0;
              }
            });
            freeQty += freeCubesOn(sale);
          }
        });

        monthlyData.push({
          date: dateStr,
          Revenue: dayRev,
          Production: mfcQty,
          Resell: rscQty,
          Free: freeQty,
          // "Total" makes the combined Production + Resell cube count readable
          // straight off the chart instead of having to add two bars by eye.
          // Billed cubes only — see the is_free skip above.
          Total: mfcQty + rscQty
        });
      }

      // Production vs Purchase trend over the same 30-day window. Stock ADDED
      // to Production (MFC) is what the factory made; stock added to Resell
      // (RSC) is what it bought in. Sale deductions and manual removals are
      // not intake, so only 'add' transactions count.
      const stockTrendMap = new Map();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        stockTrendMap.set(toLocalDateStr(d), {
          date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          Production: 0,
          Purchases: 0
        });
      }

      stockTxnList.forEach(txn => {
        if (txn.transaction_type !== 'add') return;
        const bucket = stockTrendMap.get(toLocalDateStr(txn.created_at));
        if (!bucket) return;
        const qty = Number(txn.quantity_change) || 0;
        if (qty <= 0) return;
        if (txn.inventory?.type === 'manufactured') bucket.Production += qty;
        else if (txn.inventory?.type === 'resell') bucket.Purchases += qty;
      });

      const stockTrend = Array.from(stockTrendMap.values());
      const trendProductionTotal = stockTrend.reduce((sum, b) => sum + b.Production, 0);
      const trendPurchaseTotal = stockTrend.reduce((sum, b) => sum + b.Purchases, 0);

      const monthlyCubesProduction = monthlyData.reduce((sum, d) => sum + d.Production, 0);
      const monthlyCubesResell = monthlyData.reduce((sum, d) => sum + d.Resell, 0);
      const monthlyCubesFree = monthlyData.reduce((sum, d) => sum + d.Free, 0);

      // Sales Distribution (Monthly): cash vs debt sales for the current
      // calendar month only, not all-time.
      let cashTotal = 0;
      let debtTotal = 0;
      salesList.forEach(sale => {
        const saleDate = new Date(sale.sale_date);
        if (saleDate < startOfMonth) return;
        if (sale.payment_type === 'cash') {
          cashTotal += Number(sale.total_amount) || 0;
        } else if (sale.payment_type === 'debt') {
          debtTotal += Number(sale.total_amount) || 0;
        }
      });

      // The `|| 1` placeholder exists only so the pie chart renders
      // something when there's truly no sales data at all — it must not
      // fire just because cash sales happen to be legitimately 0 while debt
      // sales aren't (previously showed "Cash: LKR 1" instead of 0 on a
      // debt-only day).
      const noSalesAtAll = cashTotal === 0 && debtTotal === 0;
      const pieData = [
        { name: 'Cash Sales', value: noSalesAtAll ? 1 : cashTotal },
        { name: 'Debt Sales', value: debtTotal }
      ];

      const recentSales = salesList
        .slice()
        .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
        .slice(0, 5)
        .map(s => ({
          ...s,
          customerName: custMap.get(s.customer_id)?.name || 'Unknown'
        }));

      const recentDebts = debtsList
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
        .map(d => ({
          ...d,
          customerName: custMap.get(d.customer_id)?.name || 'Unknown'
        }));

      const recentSettlements = settlementsList
        .slice()
        .sort((a, b) => new Date(b.settlement_date) - new Date(a.settlement_date))
        .slice(0, 5)
        .map(setl => {
          const matchingDebt = debtsList.find(d => Number(d.id) === Number(setl.debt_id));
          const matchingSale = matchingDebt ? salesMap.get(matchingDebt.sale_id) : null;
          return {
            ...setl,
            customerName: custMap.get(setl.customer_id)?.name || 'Unknown',
            saleCode: matchingSale ? matchingSale.sale_code : 'N/A'
          };
        });

      setData({
        stats: {
          mfcSoldToday,
          rscSoldToday,
          totalCubesSoldToday,
          freeCubesToday,
          totalFreeCubes,
          totalInventory,
          mfcInventory,
          rscInventory,
          totalProductionResellCubes,
          revenueToday,
          totalRevenue,
          monthlyRevenue,
          monthlyCashFlow,
          totalOutstandingDebts,
          pendingDebtsCount
        },
        charts: {
          monthly: monthlyData,
          stockTrend,
          pie: pieData
        },
        totals: {
          monthlyCubesProduction,
          monthlyCubesResell,
          monthlyCubesTotal: monthlyCubesProduction + monthlyCubesResell,
          monthlyCubesFree,
          // The pie's `|| 1` placeholder must never leak into the displayed
          // total, so sum the real figures rather than the chart data.
          salesDistributionTotal: cashTotal + debtTotal,
          trendProductionTotal,
          trendPurchaseTotal
        },
        tables: {
          recentSales,
          recentDebts,
          recentSettlements
        }
      });
    } catch (err) {
      console.error("Dashboard compilation failed:", err);
      setData(defaultDashboardData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchDashboardData = coalesceRefetch(fetchDashboardData);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboardData();

    const channel = supabase
      .channel(`dashboard-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, refetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, refetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, refetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, refetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, refetchDashboardData)
      .subscribe();

    return () => {
      refetchDashboardData.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    dashboardData: data,
    isLoading
  };
}
