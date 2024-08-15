import frappe
from frappe import _
from collections import defaultdict
from functools import lru_cache

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    data = format_data(data)
    chart_data = get_chart_data(data)
    summary_data = get_summary_data(data)
    return columns, data, None, chart_data, summary_data

def get_columns():
    return [
        {"label": _("Work Order"), "fieldname": "work_order", "fieldtype": "Link", "options": "Work Order", "width": 200, "bold": 1},
        {"label": _("Customer"), "fieldname": "customer", "fieldtype": "Data", "width": 200, "bold": 1},
        {"label": _("Job Card ID"), "fieldname": "name", "fieldtype": "Link", "options": "Job Card", "width": 120},
        {"label": _("Production Item"), "fieldname": "production_item", "fieldtype": "Link", "options": "Item", "width": 120},
        {"label": _("Operation"), "fieldname": "operation", "fieldtype": "Link", "options": "Operation", "width": 120},
        {"label": _("Required Quantity"), "fieldname": "for_quantity", "fieldtype": "Float", "width": 100},
        {"label": _("Completed Quantity"), "fieldname": "total_completed_qty", "fieldtype": "Float", "width": 120},
        # {"label": _("Process Loss Quantity"), "fieldname": "process_loss_qty", "fieldtype": "Float", "width": 150},
        {"label": _("Time Required (mins)"), "fieldname": "time_required", "fieldtype": "Float", "width": 150},
        {"label": _("Actual Time Taken (mins)"), "fieldname": "total_time_in_mins", "fieldtype": "Float", "width": 150},
    ]

def get_data(filters):
    conditions = get_conditions(filters)
    # Only select required fields
    data = frappe.db.sql("""
        SELECT 
            jc.name, jc.work_order, wo.custom_customer AS customer, jc.production_item, jc.operation,
            jc.for_quantity, jc.total_completed_qty, jc.process_loss_qty, jc.time_required, jc.total_time_in_mins
        FROM 
            `tabJob Card` jc
        LEFT JOIN
            `tabWork Order` wo ON jc.work_order = wo.name
        WHERE
            {conditions}
        ORDER BY
            wo.name, jc.name
    """.format(conditions=conditions), filters, as_dict=True)
    
    return data

def get_conditions(filters):
    conditions = []
    if filters.get("from_date"):
        conditions.append("jc.posting_date >= %(from_date)s")
    if filters.get("to_date"):
        conditions.append("jc.posting_date <= %(to_date)s")
    if filters.get("work_order"):
        conditions.append("jc.work_order = %(work_order)s")
    if filters.get("production_item"):
        conditions.append("jc.production_item = %(production_item)s")
    if filters.get("operation"):
        conditions.append("jc.operation = %(operation)s")
    if filters.get("workstation"):
        conditions.append("jc.workstation = %(workstation)s")
    if filters.get("status"):
        conditions.append("jc.status = %(status)s")
    
    return " AND ".join(conditions) if conditions else "1=1"

def format_data(data):
    formatted_data = []
    previous_work_order = None
    
    for entry in data:
        if entry['work_order'] == previous_work_order:
            entry['work_order'] = ""
            entry['customer'] = ""
        else:
            previous_work_order = entry['work_order']
        formatted_data.append(entry)
    
    return formatted_data

def get_chart_data(data):
    return None
    # labels = (entry.get("name") for entry in data)
    # completed_qty = (entry.get("total_completed_qty") for entry in data)
    # process_loss_qty = (entry.get("process_loss_qty") for entry in data)

    # return {
    #     "data": {
    #         "labels": list(labels),
    #         "datasets": [
    #             {"name": "Completed Quantity", "values": list(completed_qty)},
    #             {"name": "Process Loss Quantity", "values": list(process_loss_qty)}
    #         ]
    #     },
    #     "type": "bar",
    #     "colors": ["#00FF00", "#FF0000"]
    # }

def get_summary_data(data):
    total_for_quantity = sum(entry["for_quantity"] for entry in data if entry["for_quantity"])
    total_completed_qty = sum(entry["total_completed_qty"] for entry in data if entry["total_completed_qty"])
    total_process_loss_qty = sum(entry["process_loss_qty"] for entry in data if entry["process_loss_qty"])

    return [
        {"label": _("Required Quantity"), "value": total_for_quantity, "datatype": "Float"},
        {"label": _("Total Completed Quantity"), "value": total_completed_qty, "datatype": "Float"},
        # {"label": _("Total Process Loss Quantity"), "value": total_process_loss_qty, "datatype": "Float"}
    ]
