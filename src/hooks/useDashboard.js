import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const defaultDashboardData = {
  stats: {
    mfcSoldToday: 0,
    rscSoldToday: 0,
    totalCubesSoldToday: 0,
    totalInventory: 0,
    revenueToday: 0,
    totalRevenue: 0,
    pendingDebtsCount: 0
  },
  charts: {
    weekly: [],
    monthly: [],
    pie: [{ name: 'Cash Sales', value: 1 }, { name: 'Debt Sales', value: 0 }]
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
        inventoryList
      ] = await Promise.all([
        supabase.from('sales').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('debts').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('debt_settlements').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('customers').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('inventory').select('*').then(res => res.data || []).catch(() => [])
      ]);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const custMap = new Map(customersList.map(c => [c.id, c]));
      const salesMap = new Map(salesList.map(s => [s.id, s]));

      let mfcSoldToday = 0;
      let rscSoldToday = 0;
      let revenueToday = 0;
      let totalRevenue = 0;

      salesList.forEach(sale => {
        const amt = Number(sale.total_amount) || 0;
        totalRevenue += amt;

        const saleDate = new Date(sale.sale_date);
        if (saleDate >= startOfToday) {
          if (sale.cube_type === 'manufactured') {
            mfcSoldToday += Number(sale.quantity) || 0;
          } else if (sale.cube_type === 'resell') {
            rscSoldToday += Number(sale.quantity) || 0;
          }
          revenueToday += amt;
        }
      });

      const totalCubesSoldToday = mfcSoldToday + rscSoldToday;
      const totalInventory = inventoryList.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

      const pendingDebtsCount = debtsList.filter(d => d.status === 'pending' || d.status === 'partial').length;

      const weeklyData = [];
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = weekdays[d.getDay()];
        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        
        let mfcQty = 0;
        let rscQty = 0;
        
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);
        
        salesList.forEach(sale => {
          const sDate = new Date(sale.sale_date);
          if (sDate >= dayStart && sDate <= dayEnd) {
            if (sale.cube_type === 'manufactured') {
              mfcQty += Number(sale.quantity) || 0;
            } else if (sale.cube_type === 'resell') {
              rscQty += Number(sale.quantity) || 0;
            }
          }
        });
        
        weeklyData.push({
          name: dayName,
          date: dateStr,
          Manufactured: mfcQty,
          Resell: rscQty
        });
      }

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
        salesList.forEach(sale => {
          const sDate = new Date(sale.sale_date);
          if (sDate >= dayStart && sDate <= dayEnd) {
            dayRev += Number(sale.total_amount) || 0;
          }
        });
        
        monthlyData.push({
          date: dateStr,
          Revenue: dayRev
        });
      }

      let cashTotal = 0;
      let debtTotal = 0;
      salesList.forEach(sale => {
        if (sale.payment_type === 'cash') {
          cashTotal += Number(sale.total_amount) || 0;
        } else if (sale.payment_type === 'debt') {
          debtTotal += Number(sale.total_amount) || 0;
        }
      });
      
      const pieData = [
        { name: 'Cash Sales', value: cashTotal || 1 },
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
          totalInventory,
          revenueToday,
          totalRevenue,
          pendingDebtsCount
        },
        charts: {
          weekly: weeklyData,
          monthly: monthlyData,
          pie: pieData
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
    fetchDashboardData();

    const channel = supabase
      .channel(`dashboard-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => fetchDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    dashboardData: data,
    isLoading
  };
}
