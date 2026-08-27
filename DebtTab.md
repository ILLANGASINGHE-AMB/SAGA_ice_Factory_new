New Debt History Table

|Date & Time|Customer Name|Sales Code|Debt Amount|Paid Amount|Payment Method|Remaining Amount|Download PDF|



Example:-

Customer A:- LKR 25,000 (debt) : Date 11/12/2026
Customer B:- LKR 15,000 (debt) : Date 12/12/2026
Customer C:- LKR 5000 (debt) : Date 13/12/2026

Customer A made a cash order of LKR 30,000 : Date 15/12/2026

LKR 25,000 debt settled with that Cash Order [sales code] 

Remaning debt for [sales code] cash order 

35,000-25,000= 10,000 (paid for Cash order after auto settling previous debt of 25000)
Debt created for [sales code] cash order = 35000 - 10000 = 25000

New Debt Date for [sales code] = 15/12/2026 

Remaining Debt for [sales code] cash order = 25,000 : Date 15/12/2026

Table should be like this

|Date & Time|Customer Name|Sales Code|Debt Amount|Paid Amount|Payment Method|Remaining Amount|

11/12/2026 10:30 AM|Customer A|SC001|25,000|Not Paid|Not Settled|25000|PDF Icon|
12/12/2026 11:25 AM|Customer B|SC002|15,000|15,000|Not Settled|15000|PDF Icon|
13/12/2026 9:12 AM|Customer C|SC004|5000|5000|Not Settled|5000|PDF Icon|
15/12/2026 11:31 AM|Customer A|SC009|25000|25000|Cash Order Settled|25000|PDF Icon|

When [SC001] settled by [SC009] Cash Order, The 11/12/2026 10:30 AM|Customer A|SC001|25,000|Not Paid|Not Settled|25000|PDF Icon| row should get updated as

11/12/2026 10:30 AM|Customer A|SC001|25,000|Paid|Settled by Cash Order [SC009]|0|PDF Icon|

Remaining becomes 0 fro 11/12/2026 10:30 AM|Customer A|SC001|25,000|Not Paid|Not Settled|25000|PDF Icon|

becuase that debt is settled and new debt is created for remining amount to pay for that cash order [SC009] becuase it only had 10000, becuase 25000 of its amount sent to settle old [SC001] Debt of 25,000
