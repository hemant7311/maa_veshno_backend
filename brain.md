# Mobile Shop ERP
## BRAIN.MD
Version : 1.0
Project Type : Full Stack ERP Software
Status : Planning
Architecture : MERN Stack

==================================================
PROJECT VISION
==================================================

Develop a professional Mobile Shop ERP Software that helps mobile shop owners
manage inventory, IMEI numbers, customers, suppliers, billing, finance,
wholesale records, reports, backups and shop settings from one system.

The software should be simple, fast, secure and scalable.

Primary Goal

✔ Easy to use
✔ Fast billing
✔ Accurate stock
✔ IMEI Tracking
✔ Professional Dashboard
✔ Barcode Support
✔ Excel Import Export
✔ Thermal Printer Support

==================================================
PROJECT SCOPE
==================================================

This software is built for

Small Mobile Shops

Medium Mobile Shops

Retail Mobile Stores

Wholesale Mobile Stores

==================================================
PROJECT MODULES
==================================================

01 Login

02 Dashboard

03 Inventory

04 Buyer

05 Supplier

06 Billing

07 Wholesale

08 Finance

09 Reports

10 Backup

11 Settings

12 Barcode

13 Excel Import Export

14 Thermal Printer

==================================================
TECH STACK
==================================================

Frontend

React JS
React Router
Axios
Tailwind CSS

Backend

Node JS
Express JS

Database

MongoDB

Authentication

JWT
bcrypt

File Upload

Multer

Excel

ExcelJS

Barcode

bwip-js

Printing

Browser Print
PDF Print

==================================================
PROJECT STRUCTURE
==================================================

mobile-shop-erp/

frontend/

backend/

docs/

brain.md

frontend.md

backend.md

database.md

api.md

README.md

==================================================
FRONTEND STRUCTURE
==================================================

src/

assets/

components/

pages/

layouts/

hooks/

context/

services/

utils/

routes/

styles/

==================================================
BACKEND STRUCTURE
==================================================

src/

config/

controllers/

routes/

models/

middlewares/

validators/

helpers/

services/

utils/

database/

uploads/

logs/

==================================================
DEVELOPMENT PRINCIPLES
==================================================

Keep code clean.

Keep logic reusable.

Never duplicate code.

Always validate user input.

Never hardcode business logic.

Never expose sensitive data.

Always use environment variables.

Write modular code.

Use REST API.

==================================================
USER ROLES
==================================================

Admin

Complete Access

Staff (Future)

Limited Access

==================================================
PROJECT RULES
==================================================

Inventory always updates stock.

Billing always updates stock.

Finance records are permanent.

Reports use database values only.

Dashboard uses live data.

Every action should be logged.

Deleted records should not break reports.

==================================================
DESIGN RULES
==================================================

Modern UI

Clean Layout

Minimal Design

Desktop First

Responsive

Fast Loading

Professional Colors

Easy Navigation

==================================================
COLOR SYSTEM
==================================================

Primary

#2563EB

Secondary

#1E40AF

Background

#F8FAFC

Card

#FFFFFF

Success

#16A34A

Danger

#DC2626

Warning

#F59E0B

==================================================
TYPOGRAPHY
==================================================

Font

Inter

Headings

Bold

Body

Regular

==================================================
NAMING CONVENTION
==================================================

camelCase

Example

productName

folderId

invoiceNumber

customerName

==================================================
DATABASE ID RULE
==================================================

MongoDB ObjectId

Never use custom IDs.

==================================================
DATE FORMAT
==================================================

DD/MM/YYYY

Store

ISO Date

==================================================
TIME FORMAT
==================================================

24 Hours

==================================================
CURRENCY
==================================================

Indian Rupees

₹

==================================================
SECURITY RULES
==================================================

Passwords encrypted.

JWT Authentication.

Protected Routes.

Role Based Access.

Validate every request.

Sanitize inputs.

==================================================
GENERAL AI RULES
==================================================

Brain.md is the master document.

Frontend AI cannot change backend logic.

Backend AI cannot change frontend UI.

Both AI must follow API contract.

Never remove any existing feature.

Never rename database fields without approval.

Never change response format.

Never break old functionality.

==================================================
PROJECT PHASES
==================================================

Phase 1

Authentication

Dashboard

Phase 2

Inventory

IMEI

Barcode

Phase 3

Buyer

Supplier

Phase 4

Billing

Thermal Print

Phase 5

Wholesale

Finance

Phase 6

Reports

Excel Import Export

Backup

Settings

==================================================
MASTER GOAL
==================================================

Create a production-ready Mobile Shop ERP Software that is simple, reliable,
maintainable and scalable while preserving the workflow defined in the project
documentation and PDF.
===========================================================
PART 2
BUSINESS LOGIC
===========================================================

# DASHBOARD

Purpose

Display complete business summary in one screen.

Dashboard Cards

Total Products

Total Stock

Today's Sales

Monthly Sales

Today's Purchase

Monthly Purchase

Total Customers

Total Suppliers

Pending Finance

Pending Wholesale

Profit

Loss

Recent Activities

Recent Bills

Low Stock Alert

Out of Stock Alert

Dashboard Rules

Dashboard must always display live database values.

Dashboard should never store data.

Dashboard is only for analytics.

===========================================================
INVENTORY MODULE
===========================================================

Purpose

Manage complete mobile inventory.

Inventory Structure

Folder

↓

Product

↓

Variant

↓

IMEI

Folder

Example

Samsung

Vivo

Oppo

Apple

Accessories

Product

Example

Samsung S25

iPhone 16

Realme GT

Variant

Example

8GB / 128GB

12GB / 256GB

Each Variant contains

Price

Purchase Price

Sale Price

GST

Stock

IMEI List

Status

===========================================================
IMEI MANAGEMENT
===========================================================

Every physical mobile has unique IMEI.

Rules

One IMEI = One Physical Device

Duplicate IMEI not allowed.

Sold IMEI cannot be reused.

Deleted IMEI moves to archive.

IMEI Status

Available

Reserved

Sold

Returned

Damaged

Lost

===========================================================
STOCK LOGIC
===========================================================

Stock increases when

Purchase added.

Stock decreases when

Invoice generated.

Stock restored when

Invoice cancelled.

Manual stock editing requires admin permission.

===========================================================
BUYER MODULE
===========================================================

Purpose

Maintain customer records.

Customer Details

Name

Phone

Email

Address

GST Number

Purchase History

Outstanding Amount

Rules

Duplicate phone warning.

Customer history should never be deleted.

===========================================================
SUPPLIER MODULE
===========================================================

Purpose

Maintain supplier records.

Supplier Details

Name

Company

Phone

Address

GST Number

Balance

Purchase History

Rules

Purchase always linked to supplier.

===========================================================
BILLING MODULE
===========================================================

Purpose

Generate customer invoices.

Billing Types

GST Bill

Non GST Bill

Wholesale Bill

Finance Bill

Invoice Flow

Select Customer

↓

Add Product

↓

Verify Stock

↓

Verify IMEI

↓

Calculate Tax

↓

Generate Invoice

↓

Reduce Stock

↓

Update Reports

↓

Print Invoice

Invoice Status

Draft

Paid

Pending

Cancelled

===========================================================
PAYMENT MODES
===========================================================

Cash

UPI

Card

Bank Transfer

Credit

Mixed Payment

===========================================================
WHOLESALE MODULE
===========================================================

Purpose

Manage wholesale customers.

Store

Shop Name

Owner Name

Phone

Address

Pending Goods

Pending Payment

Wholesale History

===========================================================
FINANCE MODULE
===========================================================

Purpose

Track financed mobile sales.

Finance Types

Company Finance

Personal Finance

Store

Finance Company

Customer

Device

IMEI

Bill

Amount

Down Payment

Pending Amount

Approval Status

===========================================================
REPORT MODULE
===========================================================

Generate

Sales Report

Purchase Report

Customer Report

Supplier Report

Stock Report

Finance Report

Wholesale Report

Daily Report

Monthly Report

Yearly Report

===========================================================
BACKUP MODULE
===========================================================

Purpose

Protect business data.

Backup Types

Local Backup

Cloud Backup

Manual Backup

Automatic Backup

Restore Backup

===========================================================
SETTINGS MODULE
===========================================================

Store

Shop Name

Owner Name

GST Number

Phone

Email

Address

Invoice Prefix

Tax Percentage

Logo

===========================================================
BARCODE MODULE
===========================================================

Purpose

Fast product search.

Functions

Generate Barcode

Print Barcode

Scan Barcode

Search Product

Rules

Barcode unique.

Barcode linked with product.

Barcode searchable from billing.

===========================================================
EXCEL IMPORT EXPORT
===========================================================

Import

Products

Customers

Suppliers

Export

Products

Invoices

Sales Report

Purchase Report

Stock Report

Import Rules

Validate required columns.

Reject duplicate IMEI.

Reject invalid data.

Generate import report.

===========================================================
THERMAL PRINTER
===========================================================

Support

58mm

80mm

Print

Invoice

Receipt

Barcode

Shop Details

Customer Details

Products

GST

Payment Mode

Total

Footer

===========================================================
MASTER BUSINESS RULES
===========================================================

Billing always updates inventory.

Inventory always updates reports.

Reports always use database.

Dashboard always uses reports.

Finance linked with invoice.

Wholesale linked with customer.

Customer history never deleted.

IMEI never duplicated.

Barcode always unique.

Every important action stored in logs.

===========================================================
END OF PART 2
===========================================================

===========================================================
PART 3
DATABASE DESIGN & API CONTRACT
===========================================================

DATABASE

MongoDB

ODM

Mongoose

===========================================================
COLLECTIONS
===========================================================

users

products

folders

imeis

customers

suppliers

purchases

purchaseItems

invoices

invoiceItems

wholesales

finances

reports

settings

activityLogs

backups

===========================================================
USER COLLECTION
===========================================================

_id

name

email

phone

password

role

status

lastLogin

createdAt

updatedAt

===========================================================
FOLDER COLLECTION
===========================================================

_id

folderName

description

status

createdAt

updatedAt

===========================================================
PRODUCT COLLECTION
===========================================================

_id

folderId

productName

brand

model

variant

color

barcode

purchasePrice

salePrice

gst

stock

minStock

status

createdAt

updatedAt

===========================================================
IMEI COLLECTION
===========================================================

_id

productId

imei

serialNumber

purchaseDate

status

invoiceId

remarks

createdAt

===========================================================
CUSTOMER COLLECTION
===========================================================

_id

customerName

phone

email

address

gstNumber

balance

status

createdAt

===========================================================
SUPPLIER COLLECTION
===========================================================

_id

supplierName

companyName

phone

email

address

gstNumber

balance

createdAt

===========================================================
PURCHASE COLLECTION
===========================================================

_id

supplierId

invoiceNumber

purchaseDate

totalAmount

paymentMode

status

createdAt

===========================================================
PURCHASE ITEM
===========================================================

purchaseId

productId

imeiId

quantity

purchasePrice

gst

total

===========================================================
INVOICE COLLECTION
===========================================================

_id

invoiceNumber

invoiceType

customerId

subtotal

gst

discount

grandTotal

paymentMode

status

createdAt

===========================================================
INVOICE ITEM
===========================================================

invoiceId

productId

imeiId

quantity

salePrice

gst

total

===========================================================
WHOLESALE COLLECTION
===========================================================

_id

shopName

ownerName

phone

address

pendingAmount

status

createdAt

===========================================================
FINANCE COLLECTION
===========================================================

_id

financeType

financeCompany

customerId

invoiceId

device

imei

loanAmount

downPayment

pendingAmount

status

createdAt

===========================================================
REPORT COLLECTION
===========================================================

_id

reportType

fromDate

toDate

generatedBy

createdAt

===========================================================
BACKUP COLLECTION
===========================================================

_id

backupName

backupType

location

createdBy

createdAt

===========================================================
SETTINGS COLLECTION
===========================================================

_id

shopName

ownerName

gstNumber

phone

email

address

invoicePrefix

logo

createdAt

===========================================================
ACTIVITY LOG COLLECTION
===========================================================

_id

userId

module

action

description

ipAddress

createdAt

===========================================================
RELATIONSHIP
===========================================================

Folder

↓

Products

↓

IMEI

↓

Invoice Item

↓

Invoice

↓

Customer

===========================================================
API VERSION
===========================================================

/api/v1

===========================================================
AUTH ROUTES
===========================================================

POST /auth/login

POST /auth/logout

GET /auth/profile

PUT /auth/change-password

===========================================================
DASHBOARD ROUTES
===========================================================

GET /dashboard

GET /dashboard/cards

GET /dashboard/recent-sales

GET /dashboard/low-stock

===========================================================
FOLDER ROUTES
===========================================================

GET /folders

POST /folders

PUT /folders/:id

DELETE /folders/:id

===========================================================
PRODUCT ROUTES
===========================================================

GET /products

GET /products/:id

POST /products

PUT /products/:id

DELETE /products/:id

GET /products/search

===========================================================
IMEI ROUTES
===========================================================

GET /imeis

POST /imeis

PUT /imeis/:id

DELETE /imeis/:id

GET /imeis/search

===========================================================
CUSTOMER ROUTES
===========================================================

GET /customers

POST /customers

PUT /customers/:id

DELETE /customers/:id

===========================================================
SUPPLIER ROUTES
===========================================================

GET /suppliers

POST /suppliers

PUT /suppliers/:id

DELETE /suppliers/:id

===========================================================
PURCHASE ROUTES
===========================================================

GET /purchases

POST /purchases

GET /purchases/:id

PUT /purchases/:id

===========================================================
BILLING ROUTES
===========================================================

GET /invoices

POST /invoices

GET /invoices/:id

PUT /invoices/:id

DELETE /invoices/:id

GET /invoices/print/:id

===========================================================
WHOLESALE ROUTES
===========================================================

GET /wholesale

POST /wholesale

PUT /wholesale/:id

DELETE /wholesale/:id

===========================================================
FINANCE ROUTES
===========================================================

GET /finance

POST /finance

PUT /finance/:id

DELETE /finance/:id

===========================================================
REPORT ROUTES
===========================================================

GET /reports/sales

GET /reports/purchase

GET /reports/customer

GET /reports/supplier

GET /reports/stock

GET /reports/finance

===========================================================
BARCODE ROUTES
===========================================================

POST /barcode/generate

POST /barcode/scan

GET /barcode/:code

===========================================================
EXCEL ROUTES
===========================================================

POST /excel/import/products

POST /excel/import/customers

POST /excel/import/suppliers

GET /excel/export/products

GET /excel/export/customers

GET /excel/export/suppliers

GET /excel/export/sales

GET /excel/export/stock

===========================================================
BACKUP ROUTES
===========================================================

POST /backup/create

POST /backup/restore

GET /backup/history

===========================================================
SETTINGS ROUTES
===========================================================

GET /settings

PUT /settings

===========================================================
SUCCESS RESPONSE
===========================================================

{
  success: true,
  message: "",
  data: {}
}

===========================================================
ERROR RESPONSE
===========================================================

{
  success: false,
  message: "",
  error: {}
}

===========================================================
HTTP STATUS
===========================================================

200 Success

201 Created

400 Validation Error

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

500 Internal Server Error

===========================================================
VALIDATION RULES
===========================================================

Email Unique

Phone Unique

IMEI Unique

Barcode Unique

Invoice Number Unique

GST Number Optional

Price > 0

Stock >= 0

===========================================================
BACKEND STANDARDS
===========================================================

Controllers contain business logic.

Routes only define endpoints.

Models only define schema.

Services contain reusable functions.

Middlewares handle authentication,
validation and authorization.

===========================================================
END OF PART 3
===========================================================

===========================================================
PART 4
DEVELOPMENT STANDARDS & IMPLEMENTATION GUIDE
===========================================================

PROJECT ARCHITECTURE

Presentation Layer

↓

API Layer

↓

Business Logic Layer

↓

Database Layer

Never skip any layer.

===========================================================
FRONTEND ARCHITECTURE
===========================================================

Technology

React

Tailwind CSS

React Router

Axios

Context API

===========================================================
FRONTEND FOLDER STRUCTURE
===========================================================

src/

assets/

components/

layouts/

pages/

hooks/

context/

services/

utils/

routes/

styles/

constants/

===========================================================
PAGE STRUCTURE
===========================================================

Login

Dashboard

Inventory

Buyer

Supplier

Billing

Wholesale

Finance

Reports

Backup

Settings

Barcode

Excel

Profile

404

===========================================================
COMPONENT STRUCTURE
===========================================================

Navbar

Sidebar

Footer

Card

Button

Input

Select

Modal

Table

Pagination

Loader

Search Bar

Confirm Dialog

Toast

Invoice Preview

Barcode Scanner

Excel Upload

===========================================================
REACT RULES
===========================================================

Use Functional Components only.

Use Hooks.

No Class Components.

Reusable Components only.

No duplicated UI.

Never hardcode API URLs.

Use environment variables.

Never keep business logic inside UI.

===========================================================
TAILWIND RULES
===========================================================

Use utility classes.

Avoid inline CSS.

Maintain spacing consistency.

Desktop First.

Responsive for tablet and mobile.

Reusable button styles.

Reusable form styles.

===========================================================
STATE MANAGEMENT
===========================================================

Context API

Keep global state minimal.

Never duplicate state.

===========================================================
API RULES
===========================================================

All API requests go through Axios Service.

Never call fetch directly.

Never hardcode endpoints.

Centralize API configuration.

===========================================================
BACKEND ARCHITECTURE
===========================================================

Express JS

MVC Pattern

===========================================================
BACKEND FOLDER STRUCTURE
===========================================================

src/

config/

controllers/

models/

routes/

middlewares/

services/

validators/

helpers/

utils/

database/

logs/

uploads/

===========================================================
CONTROLLER RULES
===========================================================

Controller receives request.

Validate input.

Call Service.

Return response.

Never write database queries directly inside routes.

===========================================================
SERVICE RULES
===========================================================

Business Logic only.

Database communication.

Reusable functions.

No HTTP response.

===========================================================
MODEL RULES
===========================================================

Schema only.

Validation only.

Indexes.

No business logic.

===========================================================
ROUTE RULES
===========================================================

Only define routes.

Never write business logic.

Never write database queries.

===========================================================
MIDDLEWARES
===========================================================

JWT Authentication

Role Authorization

Validation

Error Handler

Logger

Upload Handler

===========================================================
VALIDATION
===========================================================

Validate every request.

Reject invalid data.

Reject duplicate IMEI.

Reject duplicate Barcode.

Reject invalid quantity.

===========================================================
ERROR HANDLING
===========================================================

Use centralized error handler.

Return readable message.

Log every server error.

Never expose stack trace.

===========================================================
LOGGING
===========================================================

Login

Logout

Invoice

Purchase

Stock Update

Delete

Backup

Restore

Settings Change

===========================================================
SECURITY
===========================================================

JWT Authentication.

Password Hashing.

Helmet.

CORS.

Rate Limiter.

Input Sanitization.

Environment Variables.

===========================================================
FILE UPLOAD
===========================================================

Allowed

Images

Excel

Logo

Maximum Size

10 MB

===========================================================
BARCODE IMPLEMENTATION
===========================================================

Generate Barcode

Store Barcode

Search Barcode

Print Barcode

Barcode must be unique.

===========================================================
EXCEL IMPLEMENTATION
===========================================================

Import Products

Import Customers

Import Suppliers

Export Products

Export Reports

Validate columns before import.

Generate import report.

===========================================================
THERMAL PRINT
===========================================================

58mm

80mm

Browser Print

Invoice Print

Receipt Print

===========================================================
DATABASE RULES
===========================================================

Use Mongoose.

No duplicate collections.

Use indexes where required.

Never delete important history.

===========================================================
CODE QUALITY
===========================================================

Meaningful variable names.

Small functions.

Reusable utilities.

No dead code.

No commented production code.

===========================================================
CURSOR AI RULES
===========================================================

Never modify frontend files.

Never change API response.

Never rename schema fields.

Never remove features.

Fix root cause only.

Use async/await.

Return proper HTTP status.

Keep code modular.

===========================================================
ANTIGRAVITY AI RULES
===========================================================

Never modify backend logic.

Never create fake APIs.

Never hardcode data.

Consume backend APIs only.

Build reusable components.

Keep UI consistent.

Follow design system.

===========================================================
BUG FIX POLICY
===========================================================

Identify root cause.

Do not apply temporary fixes.

Do not comment out code.

Do not remove functionality.

Test affected module.

Test related modules.

Document changes.

===========================================================
GIT WORKFLOW
===========================================================

main

↓

develop

↓

feature/module-name

↓

testing

↓

main

===========================================================
COMMIT FORMAT
===========================================================

feat:

fix:

refactor:

docs:

style:

test:

===========================================================
TESTING CHECKLIST
===========================================================

Authentication

Inventory

IMEI

Barcode

Billing

Wholesale

Finance

Reports

Excel Import

Excel Export

Thermal Print

Backup

Settings

===========================================================
PROJECT SUCCESS RULES
===========================================================

Fast

Secure

Scalable

Maintainable

Reusable

Professional

===========================================================
END OF PART 4
===========================================================
===========================================================
PART 5
PROJECT EXECUTION, AI WORKFLOW & DEPLOYMENT
===========================================================

PROJECT DEVELOPMENT ORDER

Never start coding randomly.

Always follow this order.

STEP 1

Project Setup

↓

STEP 2

Authentication

↓

STEP 3

Dashboard

↓

STEP 4

Inventory

↓

STEP 5

IMEI

↓

STEP 6

Barcode

↓

STEP 7

Buyer

↓

STEP 8

Supplier

↓

STEP 9

Purchase

↓

STEP 10

Billing

↓

STEP 11

Thermal Print

↓

STEP 12

Wholesale

↓

STEP 13

Finance

↓

STEP 14

Reports

↓

STEP 15

Excel Import

↓

STEP 16

Excel Export

↓

STEP 17

Backup

↓

STEP 18

Settings

↓

STEP 19

Testing

↓

STEP 20

Deployment

===========================================================
FRONTEND & BACKEND WORKFLOW
===========================================================

Frontend and Backend must work together.

Frontend never waits for completed backend.

Backend never changes frontend.

Development Order

Database

↓

Backend API

↓

Frontend UI

↓

Integration

↓

Testing

===========================================================
AI RESPONSIBILITY
===========================================================

Antigravity AI

Frontend Only

React

Tailwind

Responsive UI

Forms

Tables

Components

API Integration

Never modify backend.

Never change API contract.

Never create fake APIs.

===========================================================

Cursor AI

Backend Only

Node.js

Express

MongoDB

Authentication

Business Logic

REST APIs

Validation

Security

Never modify frontend.

Never change UI.

===========================================================
INTEGRATION RULES
===========================================================

Always use API.

No hardcoded data.

No mock response in production.

All API responses must follow standard format.

===========================================================
API RESPONSE FORMAT
===========================================================

{
  success: true,
  message: "",
  data: {}
}

===========================================================
ERROR RESPONSE
===========================================================

{
  success: false,
  message: "",
  errors: {}
}

===========================================================
BUG FIX POLICY
===========================================================

Before fixing

Read error carefully.

Find root cause.

Check affected module.

Check related modules.

Fix only actual problem.

Never remove code to hide error.

Never disable feature.

Never skip validation.

After fixing

Run tests.

Verify previous feature.

Verify related feature.

Update documentation.

===========================================================
CODE REVIEW CHECKLIST
===========================================================

Naming

Formatting

Validation

Security

Performance

Error Handling

Reusability

Maintainability

===========================================================
TESTING CHECKLIST
===========================================================

Authentication

Dashboard

Inventory

IMEI

Barcode

Buyer

Supplier

Purchase

Billing

Wholesale

Finance

Reports

Excel Import

Excel Export

Thermal Print

Backup

Settings

===========================================================
PERFORMANCE RULES
===========================================================

Lazy loading

Pagination

Search optimization

Database indexing

Image optimization

API optimization

===========================================================
SECURITY CHECKLIST
===========================================================

JWT

Password Hash

Input Validation

CORS

Helmet

Rate Limit

Environment Variables

===========================================================
BACKUP STRATEGY
===========================================================

Daily Backup

Manual Backup

Restore Backup

Backup Verification

===========================================================
DEPLOYMENT
===========================================================

Frontend

React Build

↓

Vercel / VPS

Backend

Node

↓

PM2

↓

Nginx

Database

MongoDB Atlas

===========================================================
ENVIRONMENT VARIABLES
===========================================================

PORT

MONGO_URI

JWT_SECRET

NODE_ENV

UPLOAD_PATH

===========================================================
PROJECT FOLDER
===========================================================

mobile-shop-erp/

frontend/

backend/

docs/

brain.md

frontend.md

backend.md

database.md

api.md

README.md

===========================================================
PROJECT DOCUMENTS
===========================================================

brain.md

Master Documentation

frontend.md

Frontend Guide

backend.md

Backend Guide

database.md

MongoDB Schema

api.md

REST API Documentation

README.md

Installation Guide

===========================================================
CHANGELOG
===========================================================

Every major change must be documented.

Never modify architecture without updating brain.md.

===========================================================
FUTURE MODULES
===========================================================

Employee Management

Role Management

SMS Integration

Email Notifications

Online Backup

Analytics Dashboard

These modules are optional and should not affect
the current project architecture.

===========================================================
DO'S
===========================================================

Write clean code.

Follow MVC.

Use reusable components.

Validate every request.

Use meaningful names.

Follow API contract.

Keep documentation updated.

===========================================================
DON'TS
===========================================================

Do not hardcode values.

Do not skip validation.

Do not change database fields randomly.

Do not break existing modules.

Do not expose secrets.

Do not ignore errors.

Do not use temporary fixes.

===========================================================
PROJECT COMPLETION CHECKLIST
===========================================================

Authentication ✔

Dashboard ✔

Inventory ✔

IMEI ✔

Barcode ✔

Buyer ✔

Supplier ✔

Purchase ✔

Billing ✔

Thermal Print ✔

Wholesale ✔

Finance ✔

Reports ✔

Excel Import ✔

Excel Export ✔

Backup ✔

Settings ✔

API ✔

Testing ✔

Deployment ✔

Documentation ✔

===========================================================
FINAL OBJECTIVE
===========================================================

Develop a production-ready Mobile Shop ERP that is
simple, secure, scalable, maintainable and follows
the workflow defined in the project documentation.

This brain.md is the single source of truth.

Every developer, AI agent, frontend module,
backend module and future update must follow
this document.

===========================================================
END OF brain.md
VERSION 1.0
===========================================================