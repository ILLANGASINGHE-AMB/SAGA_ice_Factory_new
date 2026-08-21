## Sales Tab ##

## Changes to be made in this tab ##

01. Add a View button per each row, when clicked that button, order can be viewd as the preview of the pdf invoice that downloads as the bill, 

no need to download every new bill that places,

02. Edit bill button

03. reduce the gap between columns, if needed




## New Order Window ##

Step 01:-
Select the payment terms for this factory cube order:
Cash or Debts

Step 02:-
Select Customer, Automatically drops down list of customers and also can search customers

Alternative if new customer:- 
same as current mini Register Form

Step 03:- 

Cube Type:|      | Rate per Cube (LKR):|      |  Order Quantity:|      | Total Amount(LKR): |   |
|+Add Row|

Auto-Calculated Total:
Remaing Debts: (if avaialble, show in red color text)

If the payment terms for this factory cube order: is Debt,

Show 

Total Debt = Sum Of Pending debts + new order price

and saves the new debt order in debts tab 

If the payment terms for this factory cube order: is Cash,

This new order price is deducted from Total Debts, as how the FIFO (First In First Out) method is used, 
for previous debts the customer has,

### The bill calulating logic is like this,

if payment method is cash,
order saves normally as a cash order, but deducts from previous debts(if debts available)

if payment method is debt,
order saves normally as a debt order, and get added to the debts tab



## ID formatting ##

01. Sales Code Format

10th order for month Aug in date 20 in year 2026

SIF-010-200826

SIF-xxx-ddmmyy (xxx = order number, dd = date, mm = month, yy = year last two digits)

02. Customer Code Format:

SIFC-xxxx

03. Employee Code Format:

SIFE-xxxx

04. Trip ID

SIFT-xxxx

05. Debts ID (if needed)

10th order for month Aug in date 20 in year 2026

SIFD-010-200826

SIFD-xxx-ddmmyy (xxx = order number, dd = date, mm = month, yy = year last two digits)