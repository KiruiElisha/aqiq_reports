// Copyright (c) 2024, RONOH and contributors
// For license information, please see license.txt

frappe.query_reports["Net Outstanding"] = {
	"filters": [
		{
			"fieldname": "company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"hidden": 1
		},
		{
			"fieldname": "party_type",
			"label": __("Party Type"),
			"fieldtype": "Select",
			"options": "Customer\nSupplier",
			"reqd": 1,
			"default": "Customer",
			"on_change": function(query_report) {
				var party_type = query_report.get_filter_value("party_type");
				var party_field = query_report.get_filter("party");
				if (party_type) {
					party_field.df.options = party_type;
					party_field.refresh();
					query_report.refresh();
				}
			}
		},
		{
			"fieldname": "party",
			"label": __("Party"),
			"fieldtype": "Dynamic Link",
			"get_options": function() {
				return frappe.query_report.get_filter_value('party_type');
			}
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname": "ageing_based_on",
			"label": __("Ageing Based On"),
			"fieldtype": "Select",
			"options": "Due Date\nPosting Date",
			"default": "Due Date"
		}
	],

	"formatter": function(value, row, column, data, default_formatter) {
		if (!data || !column.fieldname) return default_formatter(value, row, column, data);
		
		value = default_formatter(value, row, column, data);
		
		try {
			// Format currency fields
			const currencyFields = [
				"outstanding",
				"range1", "range2", "range3", "range4", "range5"
			];

			if (currencyFields.includes(column.fieldname)) {
				const amount = flt(data[column.fieldname], precision("Currency"));
				
				if (amount === null || amount === undefined) return value;

				// Add bold formatting for non-zero amounts
				if (amount !== 0) {
					value = `<b>${value}</b>`;

					// Add color coding with opacity for better visibility
					if (amount < 0) {
						value = `<span style='color:#ff5858'>${value}</span>`;
					} else if (amount > 0) {
						value = `<span style='color:#2e7d32'>${value}</span>`;
					}

					// Add thousands separator indicator for large amounts
					if (Math.abs(amount) >= 100000) {
						value = `<span style='border-bottom: 2px double #888'>${value}</span>`;
					}
				}

				// Handle aging buckets
				if (column.fieldname.startsWith("range") && amount !== 0) {
					const rangeMap = {
						range1: "Current to 30 days past due",
						range2: "31 to 60 days past due",
						range3: "61 to 90 days past due",
						range4: "91 to 120 days past due",
						range5: "More than 120 days past due"
					};

					// Calculate percentage only if outstanding exists and is not zero
					let percentageText = "";
					if (data.outstanding && data.outstanding !== 0) {
						const percentage = ((amount / data.outstanding) * 100).toFixed(1);
						percentageText = `\nPercentage: ${percentage}%`;
					}

					value = `<span title="${rangeMap[column.fieldname]}${percentageText}">${value}</span>`;
				}
			}

			// Enhanced party name formatting
			if (column.fieldname === "party_name" && value) {
				value = `<b style='color: #2c5282'>${value}</b>`;
			}

			// Simplified party group formatting - only font styling
			if (column.fieldname === "party_group" && value) {
				value = `<span style='font-style: italic'>${value}</span>`;
			}

		} catch (e) {
			console.error("Error in formatter:", e);
			return value;
		}

		return value;
	},

	"onload": function(report) {
		// Debounce the refresh function
		const debouncedRefresh = frappe.utils.debounce(() => {
				report.refresh();
		}, 300);

		report.page.add_inner_button(__("Refresh"), debouncedRefresh);

		

		

		// Add chart section button
		report.page.add_inner_button(__("Show Analytics"), () => {
			this.show_analytics_dialog(report);
		});

		// Add keyboard shortcuts
		frappe.ui.keys.add_shortcut(this.keyboardShortcuts());

		// Add context menu
		report.page.wrapper.on('contextmenu', (e) => {
			e.preventDefault();
			const menu = this.contextMenu(report);
			frappe.ui.popup_menu(menu, e);
		});

		// Add quick filters section
		this.add_quick_filters(report);
	},

	"show_analytics_dialog": function(report) {
		const dialog = new frappe.ui.Dialog({
			title: __('Outstanding Analytics'),
			size: 'large',
			fields: [
				{
					fieldname: 'aging_chart_html',
					fieldtype: 'HTML'
				},
				{
					fieldname: 'top_balances_html',
					fieldtype: 'HTML'
				}
			]
		});

		// Get the current report data
		const data = report.data;
		if (!data || !data.length) {
			frappe.msgprint(__('No data available for analytics'));
			return;
		}

		
		dialog.show();
		
		// Wait for dialog to render completely
		setTimeout(() => {
			// Create chart containers
			dialog.fields_dict.aging_chart_html.$wrapper.html(`
				<div class="chart-wrapper">
					<div class="chart-header">
						<h4>${__('Aging Distribution')}</h4>
					</div>
					<div id="aging-chart" style="height: 300px;"></div>
				</div>
			`);

			dialog.fields_dict.top_balances_html.$wrapper.html(`
				<div class="chart-wrapper" style="margin-top: 20px;">
					<div class="chart-header">
						<h4>${__('Top 10 Outstanding Balances')}</h4>
					</div>
					<div id="top-balances-chart" style="height: 300px;"></div>
				</div>
			`);

			// Add a third chart for trend analysis
			dialog.fields_dict.top_balances_html.$wrapper.append(`
				<div class="chart-wrapper" style="margin-top: 20px;">
					<div class="chart-header">
						<h4>${__('Summary Statistics')}</h4>
					</div>
					<div class="summary-stats" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding: 20px;">
						${this.get_summary_stats_html(data)}
					</div>
				</div>
			`);

			// Calculate aging distribution
			const agingTotals = {
				'0-30': data.reduce((sum, row) => sum + Math.abs(row.range1 || 0), 0),
				'31-60': data.reduce((sum, row) => sum + Math.abs(row.range2 || 0), 0),
				'61-90': data.reduce((sum, row) => sum + Math.abs(row.range3 || 0), 0),
				'91-120': data.reduce((sum, row) => sum + Math.abs(row.range4 || 0), 0),
				'120+': data.reduce((sum, row) => sum + Math.abs(row.range5 || 0), 0)
			};

			// Create aging distribution chart
			new frappe.Chart("#aging-chart", {
				data: {
					labels: Object.keys(agingTotals),
					datasets: [{
						name: __('Amount'),
						values: Object.values(agingTotals)
					}]
				},
				type: 'donut',
				height: 300,
				colors: ['#2490ef', '#48bb74', '#eab308', '#f97316', '#ef4444'],
				tooltipOptions: {
					formatTooltipY: value => format_currency(value)
				}
			});

			// Calculate top 10 outstanding balances
			const topBalances = data
				.sort((a, b) => Math.abs(b.outstanding) - Math.abs(a.outstanding))
				.slice(0, 10);

			// Create top balances chart
			new frappe.Chart("#top-balances-chart", {
				data: {
					labels: topBalances.map(row => row.party_name || row.party),
					datasets: [{
						name: __('Outstanding'),
						values: topBalances.map(row => Math.abs(row.outstanding))
					}]
				},
				type: 'bar',
				height: 300,
				colors: ['#2490ef'],
				tooltipOptions: {
					formatTooltipY: value => format_currency(value)
				}
			});

		}, 250); // Small delay to ensure DOM is ready
	},

	"get_summary_stats_html": function(data) {
		const total = data.reduce((sum, row) => sum + Math.abs(row.outstanding || 0), 0);
		const average = total / data.length;
		const overdue = data.reduce((sum, row) => 
			sum + Math.abs(row.range2 || 0) + Math.abs(row.range3 || 0) + 
			Math.abs(row.range4 || 0) + Math.abs(row.range5 || 0), 0);
		const overduePercent = ((overdue / total) * 100).toFixed(1);

		return `
			<div class="stat-card" style="background: #f8fafc; padding: 15px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
				<div style="color: #64748b; font-size: 0.9em;">Total Outstanding</div>
				<div style="font-size: 1.2em; font-weight: bold; color: #334155; margin-top: 5px;">
					${format_currency(total)}
				</div>
			</div>
			<div class="stat-card" style="background: #f8fafc; padding: 15px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
				<div style="color: #64748b; font-size: 0.9em;">Average Outstanding</div>
				<div style="font-size: 1.2em; font-weight: bold; color: #334155; margin-top: 5px;">
					${format_currency(average)}
				</div>
			</div>
			<div class="stat-card" style="background: #f8fafc; padding: 15px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
				<div style="color: #64748b; font-size: 0.9em;">Total Overdue</div>
				<div style="font-size: 1.2em; font-weight: bold; color: #334155; margin-top: 5px;">
					${format_currency(overdue)}
				</div>
			</div>
			<div class="stat-card" style="background: #f8fafc; padding: 15px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
				<div style="color: #64748b; font-size: 0.9em;">Overdue Percentage</div>
				<div style="font-size: 1.2em; font-weight: bold; color: #334155; margin-top: 5px;">
					${overduePercent}%
				</div>
			</div>
		`;
	},

	// Add keyboard shortcuts
	"keyboardShortcuts": function() {
		return [
			{
				shortcut: 'ctrl+r',
				action: () => frappe.query_report.refresh(),
				description: __('Refresh Report'),
				page: frappe.query_report.page
			},
			{
				shortcut: 'ctrl+a',
				action: () => this.show_analytics_dialog(frappe.query_report),
				description: __('Show Analytics'),
				page: frappe.query_report.page
			}
	 ];
	},

	// Add right-click context menu
	"contextMenu": function(report) {
		return [
			{
				label: __('Refresh'),
				action: () => report.refresh()
			},
			{
				label: __('Show Analytics'),
				action: () => this.show_analytics_dialog(report)
			}
	 ];
	},

	"before_run": function(report) {
		// Clear cache if date changes
		const filters = report.get_values();
		const cacheKey = `party_balances_${filters.to_date}_${filters.party_type}`;
		
		if (this.last_cache_key && this.last_cache_key !== cacheKey) {
			frappe.provide('frappe.query_reports');
			delete frappe.query_reports[report.name].data;
			delete frappe.query_reports[report.name].columns;
		}
		this.last_cache_key = cacheKey;

		// Set a reasonable page length
		frappe.query_reports[report.name].page_length = 50;

		// Add progress indicator
		frappe.show_progress('Fetching Data', 30, 100);
	},

	"after_run": function(report) {
		frappe.hide_progress();
	},

	"data_cache": {},

	"tree": false,
	"initial_depth": 3,
	"is_tree": false,
	"name_field": "party",
	
	// Add totals for currency columns
	"get_datatable_options": function(options) {
		return Object.assign(options, {
			columnTotal: {
				"outstanding": true,
				"range1": true,
				"range2": true,
				"range3": true,
				"range4": true,
				"range5": true
			},
			inlineFilters: true,
			layout: 'fixed',
			cellHeight: 40,
			showTotalRow: 1,
			firstRowIndex: 1,
			treeView: false,
			events: {
				onRemoveColumn: null,
				onAddColumn: null
			},
			dropdownButton: 0,
			filterRows: false,
			// Add subtle row hover effect
			cssClass: {
				'dt-row': 'hover:bg-gray-50 transition-colors duration-150'
			}
		});
	},

	// Add a function to handle post-render styling
	"after_datatable_render": function(datatable) {
		try {
			// Apply zebra striping
			$(datatable.wrapper).find('.dt-row-odd').css('background-color', '#f8fafc');

			// Add visual indicators
			this.add_aging_indicators(datatable);

		} catch (e) {
			console.error("Error in after_datatable_render:", e);
		}
	},

	"add_aging_indicators": function(datatable) {
		// Get report data from frappe.query_report
		const data = frappe.query_report.data;
		if (!data) return;

		data.forEach((row, i) => {
			if (!row) return;

			// Calculate total aging
			const total = Math.abs(row.range1 || 0) + 
						 Math.abs(row.range2 || 0) + 
						 Math.abs(row.range3 || 0) + 
						 Math.abs(row.range4 || 0) + 
						 Math.abs(row.range5 || 0);

			if (total === 0) return;

			// Calculate percentages
			const percentages = {
				range1: (Math.abs(row.range1 || 0) / total * 100).toFixed(1),
				range2: (Math.abs(row.range2 || 0) / total * 100).toFixed(1),
				range3: (Math.abs(row.range3 || 0) / total * 100).toFixed(1),
				range4: (Math.abs(row.range4 || 0) / total * 100).toFixed(1),
				range5: (Math.abs(row.range5 || 0) / total * 100).toFixed(1)
			};

			// Add mini bar chart under party name
			const barHtml = `
				<div class="aging-bars" style="display: flex; height: 3px; margin-top: 4px; border-radius: 1px; overflow: hidden;">
					<div style="width: ${percentages.range1}%; background: #4CAF50;"></div>
					<div style="width: ${percentages.range2}%; background: #FFC107;"></div>
					<div style="width: ${percentages.range3}%; background: #FF9800;"></div>
					<div style="width: ${percentages.range4}%; background: #FF5722;"></div>
					<div style="width: ${percentages.range5}%; background: #F44336;"></div>
				</div>
			`;

			// Find the party name cell and append the bar
			const $row = $(datatable.wrapper).find(`.dt-row[data-row-index="${i}"]`);
			const $partyNameCell = $row.find('.dt-cell[data-col-index="1"]');
			$partyNameCell.append(barHtml);
		});
	},

	"add_quick_filters": function(report) {
		const quickFilters = $(`
			<div class="quick-filters" style="margin-bottom: 10px; display: flex; gap: 10px;">
				<button class="btn btn-xs" data-filter="all">All</button>
				<button class="btn btn-xs" data-filter="overdue">Overdue</button>
				<button class="btn btn-xs" data-filter="high">High Value</button>
			</div>
	 `).insertBefore(report.page.wrapper.find('.datatable'));

		quickFilters.on('click', 'button', function() {
			const filter = $(this).data('filter');
			quickFilters.find('button').removeClass('btn-primary');
			$(this).addClass('btn-primary');

			switch(filter) {
				case 'overdue':
					frappe.query_report.datatable.rowmanager.filterRows(row => 
						(row.range2 || 0) + (row.range3 || 0) + 
						(row.range4 || 0) + (row.range5 || 0) > 0
					);
					break;
				case 'high':
					const avg = frappe.query_report.data.reduce((sum, row) => 
						sum + Math.abs(row.outstanding || 0), 0) / frappe.query_report.data.length;
					frappe.query_report.datatable.rowmanager.filterRows(row => 
						Math.abs(row.outstanding || 0) > avg
					);
					break;
				default:
					frappe.query_report.datatable.rowmanager.filterRows(null);
			}
		});
	}
};
