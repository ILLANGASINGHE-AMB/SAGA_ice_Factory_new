import { supabase } from '../lib/supabase';

/**
 * Fetch full real-time snapshot of all factory system data
 * (including sensitive financial, customer, production, maintenance, and expense data)
 */
export async function fetchFullSystemContext() {
  try {
    const [
      { data: inventory },
      { data: customers },
      { data: sales },
      { data: debts },
      { data: settlements },
      { data: productionBatches },
      { data: maintenanceLogs },
      { data: operatingExpenses },
      { data: settingsData }
    ] = await Promise.all([
      supabase.from('inventory').select('*').order('id', { ascending: true }),
      supabase.from('customers').select('*').order('id', { ascending: true }),
      supabase.from('sales').select('*').order('sale_date', { ascending: false }).limit(50),
      supabase.from('debts').select('*').order('created_at', { ascending: false }),
      supabase.from('debt_settlements').select('*').order('settlement_date', { ascending: false }).limit(50),
      supabase.from('production_batches').select('*').order('batch_date', { ascending: false }).limit(30),
      supabase.from('equipment_maintenance').select('*').order('created_at', { ascending: false }),
      supabase.from('operating_expenses').select('*').order('expense_date', { ascending: false }).limit(50),
      supabase.from('settings').select('*').limit(1)
    ]);

    // Financial calculations
    const salesList = sales || [];
    const totalRevenue = salesList.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
    
    const debtsList = debts || [];
    const totalOutstandingDebt = debtsList.reduce((acc, d) => acc + (Number(d.remaining_amount) || 0), 0);
    const totalCollectedDebt = debtsList.reduce((acc, d) => acc + (Number(d.paid_amount) || 0), 0);
    
    const expensesList = operatingExpenses || [];
    const totalExpenses = expensesList.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const batchesList = productionBatches || [];
    const totalCubesProduced = batchesList.reduce((acc, b) => acc + (Number(b.cubes_produced) || 0), 0);
    const totalEnergyCost = batchesList.reduce((acc, b) => acc + (Number(b.total_energy_cost) || 0), 0);
    const avgCostPerCube = batchesList.length > 0
      ? (batchesList.reduce((acc, b) => acc + (Number(b.cost_per_cube) || 0), 0) / batchesList.length).toFixed(4)
      : '0.0000';

    const maintenanceList = maintenanceLogs || [];
    const totalMaintenanceCost = maintenanceList.reduce((acc, m) => acc + (Number(m.cost) || 0), 0);

    const settingsObj = (settingsData && settingsData.length > 0) ? settingsData[0] : {};

    return `
You are SAGA AI, the intelligent AI executive assistant for Sagacious Ice Factory ("Saga Ice").
You have full access to analyze all system data including sensitive operational, financial, customer, production, debt, expense, and equipment maintenance metrics.
Provide sharp, business-focused insights, answers, calculations, and recommendations based on the real-time factory database snapshot below.

=== REAL-TIME FACTORY DATABASE SNAPSHOT ===

1. COMPANY CONFIGURATION:
- Company Name: ${settingsObj.company_name || 'Sagacious Ice Factory'}
- Contact Phone: ${settingsObj.company_phone || 'N/A'}
- Contact Email: ${settingsObj.company_email || 'N/A'}
- Address: ${settingsObj.company_address || 'N/A'}

2. INVENTORY & STOCK LEVELS:
${JSON.stringify(inventory || [], null, 2)}

3. FINANCIAL & REVENUE SUMMARY:
- Recent Sales Recorded: ${salesList.length} orders
- Total Sales Revenue (Recent): LKR ${totalRevenue.toLocaleString()}
- Outstanding Customer Debts: LKR ${totalOutstandingDebt.toLocaleString()}
- Recovered Debt Payments: LKR ${totalCollectedDebt.toLocaleString()}
- Operating Ledger Expenses: LKR ${totalExpenses.toLocaleString()}
- Equipment Maintenance Expenses: LKR ${totalMaintenanceCost.toLocaleString()}
- Total Freezing Energy Cost: LKR ${totalEnergyCost.toLocaleString()}

4. CUSTOMERS & DEBTORS DATABASE (Includes Sensitive Data):
${JSON.stringify(customers || [], null, 2)}

5. ACTIVE DEBTS RECORD:
${JSON.stringify(debts || [], null, 2)}

6. RECENT SALES TRANSACTIONS (Top 50):
${JSON.stringify(salesList, null, 2)}

7. DEBT SETTLEMENT HISTORY:
${JSON.stringify(settlements || [], null, 2)}

8. FREEZING PRODUCTION BATCHES & ENERGY CONSUMPTION:
- Total Cubes Freezed: ${totalCubesProduced.toLocaleString()} cubes
- Average Cost Per Ice Cube: LKR ${avgCostPerCube}
- Batch History:
${JSON.stringify(batchesList, null, 2)}

9. MACHINERY & EQUIPMENT MAINTENANCE:
- Maintenance Logs:
${JSON.stringify(maintenanceList, null, 2)}

10. OPERATING EXPENSES LEDGER:
- Expenses:
${JSON.stringify(expensesList, null, 2)}

=== END OF SNAPSHOT ===

GUIDELINES FOR SAGA AI:
- Address yourself as "SAGA AI".
- Be professional, highly analytical, clear, and proactive.
- When asked about financials, profits, debts, production costs, machinery statuses, or customers, use the real figures from the snapshot above.
- Format responses clearly using markdown bold text, bullet points, and tables when helpful.
- If data shows equipment maintenance is due or offline, warn the user proactively if relevant.
- All currency values are in LKR (Sri Lankan Rupees) unless specified otherwise.
`;
  } catch (err) {
    console.error("SAGA AI failed to gather system context:", err);
    return `You are SAGA AI, the intelligent AI assistant for Sagacious Ice Factory ("Saga Ice"). (Note: Error fetching detailed context: ${err.message})`;
  }
}

/**
 * Dynamically find an active Gemini model supported by the user's API Key
 */
export async function getAvailableGeminiModel(cleanKey) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      
      // Filter models that support generateContent
      const validModels = models
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name ? m.name.replace(/^models\//, '') : '');

      const priorityOrder = [
        'gemini-3.6-flash',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-1.5-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash'
      ];

      for (const modelName of priorityOrder) {
        if (validModels.includes(modelName)) {
          return modelName;
        }
      }

      const anyFlash = validModels.find(m => m.includes('flash'));
      if (anyFlash) return anyFlash;
      if (validModels.length > 0) return validModels[0];
    }
  } catch (e) {
    console.warn("Could not list Gemini models dynamically:", e);
  }
  return null;
}

const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash-lite'
];

/**
 * Test Gemini API Key validity securely via Supabase Edge Function proxy
 */
export async function testGeminiApiKey(apiKey) {
  const cleanKey = apiKey ? apiKey.trim() : '';

  // 1. Try server-side Edge Function proxy test first
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('saga-ai-proxy', {
      body: { action: 'test', apiKey: cleanKey || undefined }
    });

    if (!edgeErr && edgeData && edgeData.success) {
      return { success: true, modelUsed: edgeData.modelUsed || 'gemini-2.5-flash', text: edgeData.text };
    } else if (edgeErr || edgeData?.error) {
      const errMsg = edgeData?.error || edgeErr?.message;
      if (errMsg && !errMsg.includes('Failed to send a request') && !errMsg.includes('FunctionsFetchError')) {
        throw new Error(errMsg);
      }
    }
  } catch (proxyErr) {
    if (proxyErr.message && !proxyErr.message.includes('FunctionsFetchError')) {
      throw proxyErr;
    }
    console.warn("Edge function proxy test bypass, attempting direct connection:", proxyErr);
  }

  // 2. Direct client verification fallback if key is provided
  if (!cleanKey) {
    throw new Error("Gemini API Key is missing. Please provide a key or configure GEMINI_API_KEY environment secret on the Edge Function server.");
  }

  // Dynamically fetch models supported by this specific API Key
  const dynamicModel = await getAvailableGeminiModel(cleanKey);
  const modelsToTry = dynamicModel 
    ? [dynamicModel, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-1.5-flash']
    : ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-1.5-flash'];

  const errorDetails = [];

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: 'Hello, confirm connection.' }]
              }
            ]
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return { success: true, modelUsed: model, text };
      } else {
        const errorMsg = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        errorDetails.push(`[${model}]: ${errorMsg}`);
      }
    } catch (err) {
      errorDetails.push(`[${model}]: ${err.message}`);
    }
  }

  throw new Error(`API Key verification failed: ${errorDetails.join(' | ') || 'Invalid API Key'}`);
}

/**
 * Send chat conversation securely via Supabase Edge Function proxy with full system context
 */
export async function sendSagaAiMessage(messages, apiKey) {
  const systemContextPrompt = await fetchFullSystemContext();

  const conversationHistoryText = messages.map(msg => 
    `${msg.role === 'user' ? 'USER' : 'SAGA AI'}: ${msg.content}`
  ).join('\n\n');

  const fullPromptText = `${systemContextPrompt}\n\n=== CONVERSATION HISTORY ===\n${conversationHistoryText}\n\nSAGA AI RESPONSE:`;
  const cleanKey = apiKey ? apiKey.trim() : undefined;

  // 1. Attempt server-side Edge Function proxy call first
  try {
    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('saga-ai-proxy', {
      body: { action: 'chat', prompt: fullPromptText, apiKey: cleanKey }
    });

    if (!edgeErr && edgeData && edgeData.reply) {
      return edgeData.reply;
    } else if (edgeErr || edgeData?.error) {
      const errMsg = edgeData?.error || edgeErr?.message;
      if (errMsg && !errMsg.includes('Failed to send a request') && !errMsg.includes('FunctionsFetchError')) {
        throw new Error(`SAGA AI Edge Error: ${errMsg}`);
      }
    }
  } catch (proxyErr) {
    if (proxyErr.message && proxyErr.message.startsWith('SAGA AI Edge Error:')) {
      throw proxyErr;
    }
    console.warn("Edge function proxy bypass, attempting direct connection:", proxyErr);
  }

  // 2. Direct client connection fallback if API key is provided
  if (!cleanKey) {
    throw new Error("Gemini API Key is not configured. Please configure your API key in Admin Settings or set GEMINI_API_KEY on the Edge Function server.");
  }

  // Dynamically fetch model for this key
  const dynamicModel = await getAvailableGeminiModel(cleanKey);
  const modelsToTry = dynamicModel 
    ? [dynamicModel, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-1.5-flash']
    : ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.6-flash', 'gemini-1.5-flash'];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: fullPromptText }]
              }
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 2048
            }
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) {
          return replyText;
        } else {
          throw new Error("Received empty response from Gemini API.");
        }
      } else {
        const errorMsg = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        const lowerErr = errorMsg.toLowerCase();
        
        if (
          lowerErr.includes('api_key_invalid') || 
          lowerErr.includes('api key not valid') ||
          lowerErr.includes('invalid api key')
        ) {
          throw new Error(`Gemini API Error: ${errorMsg}`);
        }

        lastError = errorMsg;
      }
    } catch (err) {
      if (
        err.message.toLowerCase().includes('api_key_invalid') ||
        err.message.toLowerCase().includes('api key not valid') ||
        err.message.toLowerCase().includes('invalid api key')
      ) {
        throw err;
      }
      lastError = err.message;
    }
  }

  throw new Error(`SAGA AI Error: ${lastError || 'Unable to connect to Gemini API.'}`);
}
