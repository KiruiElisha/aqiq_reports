// Copyright (c) 2024, RONOH and contributors
// For license information, please see license.txt

frappe.query_reports["Production Variance"] = {
    "filters": [
        {
            "fieldname": "work_order",
            "label": __("Work Order"),
            "fieldtype": "Link",
            "options": "Work Order",
            "reqd": 0
        },
        {
            "fieldname": "from_date",
            "label": "From",
            "fieldtype": "Date",
            "options": "",
            "default": new Date(new Date().setFullYear(new Date().getFullYear() - 1))
        },
        {
            "fieldname": "to_date",
            "label": "To",
            "fieldtype": "Date",
            "options": "",
            "default": new Date()
        }
    ]
};
