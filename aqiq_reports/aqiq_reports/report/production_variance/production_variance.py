# Copyright (c) 2024, RONOH and contributors
# For license information, please see license.txt

import frappe
import datetime

def fetch_work_orders(filters):
    work_order_filters = {"name": filters.get("work_order"), "qty": (">", 0)} if filters and filters.get("work_order") else {"qty": (">", 0)}
    return frappe.get_all("Work Order", fields=["name", "production_item", "qty", "planned_start_date"], filters=work_order_filters)

def fetch_required_materials(work_order):
    return frappe.get_all("Work Order Item", filters={"parent": work_order.name}, fields=["item_code", "item_name", "required_qty", "transferred_qty"])

def fetch_stock_entries(filters):
    stock_entry_filters = {"work_order": filters.get("work_order"), "docstatus": 1, "stock_entry_type": "Manufacture"}
    stock_entry_name = filters.get("stock_entry")
    if stock_entry_name:
        stock_entry_filters["name"] = stock_entry_name
    return frappe.get_all("Stock Entry", filters=stock_entry_filters, fields=["name", "fg_completed_qty"])

def calculate_percentage(produced_qty, required_qty):
    result = (produced_qty / required_qty) * 100 if required_qty > 0 else 0
    return round(result, 2)

def execute(filters=None):
    columns = [
        {"label": "Work Order", "fieldname": "work_order", "fieldtype": "Link", "options": "Work Order", "width": 100},
        {"label": "Item to Manufacture", "fieldname": "production_item", "fieldtype": "Data", "width": 150},
        {"label": "WO Qty", "fieldname": "work_order_qty", "fieldtype": "Data", "width": 100},
        {"label": "Produced Qty", "fieldname": "fg_completed_qty", "fieldtype": "Data", "width": 150},
        {"label": "Required Items", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 150},
        {"label": "Required Qty", "fieldname": "required_qty", "fieldtype": "Data", "width": 100},
        {"label": "Transferred Qty", "fieldname": "transferred_qty", "fieldtype": "Data", "width": 150},
        {"label": "Material Used", "fieldname": "produced_qty", "fieldtype": "Data", "width": 150},
        {"label": "Material Required", "fieldname": "material_required", "fieldtype": "Data", "width": 150},
        {"label": "Consumption(%)", "fieldname": "percentage", "fieldtype": "Data", "width": 150},
    ]

    report_data = []

    work_orders = fetch_work_orders(filters)
    for work_order in work_orders:
        planned_start_date = work_order.get("planned_start_date")
        planned_start_date_str = planned_start_date.strftime("%Y-%m-%d")
        if filters.get("from_date") and filters.get("to_date") and planned_start_date:
            if filters.get("from_date") <= planned_start_date_str <= filters.get("to_date"):
                stock_entries = fetch_stock_entries({"work_order": work_order.name})
                total_fg_completed_qty = sum(entry.get('fg_completed_qty', 0) for entry in stock_entries)
                qty = work_order.get("qty")
                pivot = total_fg_completed_qty / float(qty) if float(qty) > 0 else 0
                if work_order.get("production_item"):
                    required_materials = fetch_required_materials(work_order)
                    
                    report_data.append({
                        "work_order": work_order.get('name'),
                        "fg_completed_qty": total_fg_completed_qty,
                        "production_item": "<b>" + str(work_order.production_item) + "</b>",
                        "work_order_qty": "<b>" + str(qty) + "</b>"
                    })
                    
                    stock_entry_items_qty = {}
                    
                    for stock_entry in stock_entries:
                        stock_entry_items = frappe.get_all("Stock Entry Detail", filters={"parent": stock_entry.name}, fields=["item_code", "item_name", "qty"])
                        
                        for item in stock_entry_items:
                            item_code = item.item_code
                            transfer_qty = item.qty
                            stock_entry_items_qty[item_code] = stock_entry_items_qty.get(item_code, 0) + transfer_qty
                    
                    required_items_set = {material.item_code for material in required_materials}
                    stock_entry_items_set = set(stock_entry_items_qty.keys())

                    # Process required materials
                    for material in required_materials:
                        item_code = material.item_code
                        required_qty = material.required_qty
                        transferred_qty = material.transferred_qty
                        produced_qty = stock_entry_items_qty.get(item_code, 0)
                        material_required = required_qty * pivot
                        percentage = calculate_percentage(produced_qty, material_required)
                        percentage_consumption = str(percentage) + "%"

                        report_data.append({
                            "item_code": material.item_code,
                            "work_order_qty": " ",
                            "required_qty": round(required_qty, 3),
                            "stock_entry": "",
                            "transferred_qty": round(transferred_qty, 3),
                            "fg_completed_qty": " ",
                            "produced_qty": round(produced_qty, 3),
                            "material_required": round(material_required, 3),
                            "percentage": percentage_consumption
                        })
                    
                    # Process stock entry items that are not in required materials
                    non_required_items = stock_entry_items_set - required_items_set
                    for item_code in non_required_items:
                        produced_qty = stock_entry_items_qty[item_code]
                        report_data.append({
                            "item_code": item_code,
                            "work_order_qty": " ",
                            "required_qty": " ",
                            "stock_entry": "",
                            "transferred_qty": " ",
                            "fg_completed_qty": " ",
                            "produced_qty": round(produced_qty, 3),
                            "material_required": " ",
                            "percentage": "Not part of WO items"
                        })

    return columns, report_data
