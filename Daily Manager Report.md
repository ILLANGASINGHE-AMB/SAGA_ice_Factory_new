## In Reports Tab ##
Daily Manager Report should be in this structure, It should fetch realtime data when the report is generated.
Here is the Format of Report

Daily Manager Report of 
Date: (select Range)        Time: Select Range

01. Stock Details
|Last Day Remain Total Stock| |No of Production Cubes| |No of Brine cubes| |Free Issues| |Damaged| |Daily Income (cash+debt sales)| |Daily Balance of Stock|

Free Issues and Damaged is edited by after generating the report 

== Fetch data from Inventory - Production History table and Sales Tab Table ==


No of Cubes Sent to Branch:- //Number of cubes given for Specific Customer Named Branch PK//

02. Income Details
|No of Cubes for Cash Orders| |Total Cash Income| |Total Debt settles | |Other Income| |Total Income(Cash orders +Debt settles + Other Income)|
==Fetch Data from: Sales Tab and Debt Tab==

03. Debt Details
|No| Customer Name| Phone No| Total No of cubes given on Debt| Amount LKR| Total Debt Balance LKR|

==Fetch data from: Debt Tab==

Total

04. Debt Settle Details
|No| Customer Name| Payment Method (Cash/Bank/Cheque) | Debt Amount LKR| Paid Debt LKR| Remaining Debt LKR|

Total

==Fetch data from: Debt Tab==

05. Expense Details
|No| Date | Description | Expense Category (Fuel, Electricity, Wage etc) | Amount LKR| 

Total

==Fetch data from: Expense Tab==

06. Bank Deposite Details
|Amount Deposited| Cash in Hand (after deposite) | Hand Cheque Amount | 

Total

==Fetch data from: Cash & Bank Details All Cash Flow History, Cash & Bank Details Bank Transactions, Expense Tab==

07. Employee Details
|Employee Name| Date |Start Time| End Time|

==Fetch data from: Employee Details All History==

08. Vehicle Details
|No|TripID| Date| Description|Start Km|End KM|Total Distance|

==Fetch data from: Vehicles, Vehicle History==

                                            Total
09. Notes
==Fetch data from: Notes and Messages Tab==

10. Name:......................         Signature ..................................
                        Date and Time Generated

System Generated Report 