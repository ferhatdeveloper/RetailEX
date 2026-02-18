-- Standart Rapor ve Etiket Şablonları
-- Created: 2026-02-14

INSERT INTO public.report_templates (name, description, category, content, is_default)
VALUES 
(
    'Modern Satış Faturası', 
    'Logo ERP standartlarında modern ve temiz bir fatura tasarımı.', 
    'fatura', 
    '{
        "pageSize": {"width": 210, "height": 297},
        "components": [
            {"id": "logo", "type": "image", "x": 10, "y": 10, "width": 40, "height": 20},
            {"id": "title", "type": "text", "x": 150, "y": 10, "width": 50, "height": 10, "content": "SATIŞ FATURASI", "style": {"fontSize": "18px", "fontWeight": "bold", "textAlign": "right"}},
            {"id": "customer_label", "type": "text", "x": 10, "y": 40, "width": 30, "height": 5, "content": "SAYIN", "style": {"fontSize": "10px", "fontWeight": "bold"}},
            {"id": "customer_name", "type": "text", "x": 10, "y": 45, "width": 80, "height": 10, "binding": "customer.name", "style": {"fontSize": "12px"}},
            {"id": "items_header", "type": "rect", "x": 10, "y": 80, "width": 190, "height": 8, "style": {"background": "#f3f4f6"}},
            {"id": "total_label", "type": "text", "x": 140, "y": 250, "width": 30, "height": 5, "content": "GENEL TOPLAM", "style": {"fontSize": "10px", "fontWeight": "bold", "textAlign": "right"}},
            {"id": "total_value", "type": "text", "x": 170, "y": 250, "width": 30, "height": 5, "binding": "totals.net", "style": {"fontSize": "10px", "fontWeight": "bold", "textAlign": "right"}}
        ]
    }', 
    true
),
(
    'Klasik Lojistik Fatura', 
    'Detaylı sevk bilgileri içeren klasik fatura şablonu.', 
    'fatura', 
    '{
        "pageSize": {"width": 210, "height": 297},
        "components": [
            {"id": "title", "type": "text", "x": 80, "y": 10, "width": 50, "height": 10, "content": "LOJİSTİK FATURASI", "style": {"fontSize": "16px", "fontWeight": "bold", "textAlign": "center"}},
            {"id": "box", "type": "rect", "x": 10, "y": 25, "width": 190, "height": 30, "style": {"background": "transparent", "border": "1px solid #000"}}
        ]
    }', 
    false
),
(
    'Standart Ürün Etiketi (40x20mm)', 
    'Raf ve ürünler için standart barkodlu etiket.', 
    'etiket', 
    '{
        "pageSize": {"width": 40, "height": 20},
        "components": [
            {"id": "p_name", "type": "text", "x": 2, "y": 2, "width": 36, "height": 5, "binding": "product.name", "style": {"fontSize": "8px", "fontWeight": "bold"}},
            {"id": "p_price", "type": "text", "x": 2, "y": 8, "width": 36, "height": 4, "binding": "product.price", "style": {"fontSize": "10px", "fontWeight": "900"}},
            {"id": "barcode", "type": "barcode", "x": 2, "y": 13, "width": 36, "height": 5, "binding": "product.code"}
        ]
    }', 
    true
);
