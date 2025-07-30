#!/usr/bin/env python3
import json

def generate_static_html():
    """Generate HTML with embedded JSON data"""
    
    # Load the enriched data
    with open('enriched_models_enhanced.json', 'r') as f:
        data = json.load(f)
    
    # Generate HTML with embedded data
    html = '''<!DOCTYPE html>
<html>
<head>
    <title>HuggingFace Models - Enriched</title>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: monospace;
            margin: 20px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        th, td {
            border: 1px solid #000;
            padding: 4px 8px;
            text-align: left;
        }
        th {
            background: #f0f0f0;
            font-weight: bold;
        }
        tr:hover {
            background: #f9f9f9;
        }
    </style>
</head>
<body>
    <table id="modelsTable">
        <thead>
            <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Uptime %</th>
                <th>Input $/1M</th>
                <th>Output $/1M</th>
                <th>Context</th>
                <th>Quant</th>
                <th>Tools</th>
                <th>Structured</th>
            </tr>
        </thead>
        <tbody id="tableBody">
            <tr><td colspan="10">Loading...</td></tr>
        </tbody>
    </table>

    <script>
        const data = ''' + json.dumps(data) + ''';
        
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        
        data.data.forEach(model => {
            if (model.providers) {
                model.providers.forEach(provider => {
                    const row = document.createElement('tr');
                    
                    row.innerHTML = `
                        <td>${model.id}</td>
                        <td>${provider.provider}</td>
                        <td>${provider.endpoint_status_name || provider.status || '-'}</td>
                        <td>${provider.uptime_30d !== undefined ? provider.uptime_30d : '-'}</td>
                        <td>${provider.pricing?.input !== undefined ? provider.pricing.input : '-'}</td>
                        <td>${provider.pricing?.output !== undefined ? provider.pricing.output : '-'}</td>
                        <td>${provider.context_length || '-'}</td>
                        <td>${provider.quantization || '-'}</td>
                        <td>${provider.supports_tools ? 'Yes' : 'No'}</td>
                        <td>${provider.supports_structured_output ? 'Yes' : 'No'}</td>
                    `;
                    
                    tbody.appendChild(row);
                });
            }
        });
    </script>
</body>
</html>'''
    
    # Save the HTML file
    with open('index.html', 'w') as f:
        f.write(html)
    
    print("Generated static HTML table with embedded data")
    print("File saved as: index.html")

if __name__ == "__main__":
    generate_static_html()