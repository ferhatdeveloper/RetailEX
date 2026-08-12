import fs from 'fs';

const translationsPath = 'D:/RetailEX/src/components/system/ManagementModule.tsx';
let content = fs.readFileSync(translationsPath, 'utf8');

const replacements = [
    {
        search: 'title="Satış Faturaları" description="Tüm satış işlemleri ve POS satışları"',
        replace: 'title={t.salesInvoicesTitle} description={t.salesInvoicesDesc}'
    },
    {
        search: 'title="Satış Faturaları" description="Standart toptan ve perakende satış faturaları"',
        replace: 'title={t.salesInvoicesTitle} description={t.salesInvoicesDesc}'
    },
    {
        search: 'title="Perakende Satışlar" description="Perakende satış işlemleri"',
        replace: 'title={t.retailSalesTitle} description={t.retailSalesDesc}'
    },
    {
        search: 'title="Toptan Satışlar" description="Toptan satış işlemleri"',
        replace: 'title={t.wholesaleSales} description={t.wholesaleDesc}'
    },
    {
        search: 'title="Konsinye Satışlar" description="Konsinye satış işlemleri"',
        replace: 'title={t.salesInvoicesTitle} description={t.salesInvoicesDesc}'
    },
    {
        search: 'title="Satış İadeleri" description="Müşteriden gelen iadeler"',
        replace: 'title={t.salesReturnTitle} description={t.salesReturnDesc}'
    },
    {
        search: 'title="Alış Faturaları" description="Tüm satın alma işlemleri"',
        replace: 'title={t.purchaseInvoicesTitle} description={t.purchaseInvoicesDesc}'
    },
    {
        search: 'title="Alış Faturaları" description="Tedarikçilerden gelen faturalar"',
        replace: 'title={t.purchaseInvoicesTitle} description={t.purchaseInvoicesDesc}'
    },
    {
        search: 'title="Alış İadeleri" description="Tedarikçilere yapılan iadeler"',
        replace: 'title={t.purchaseReturnTitle} description={t.purchaseReturnDesc}'
    },
    {
        search: 'title="Hizmet Faturaları" description="Tüm hizmet alım ve satım işlemleri"',
        replace: 'title={t.serviceInvoices} description={t.serviceInvoices}'
    },
    {
        search: 'title="Alınan Hizmet Faturaları" description="Tedarikçilerden alınan hizmetler"',
        replace: 'title={t.receivedServiceInvoicesTitle} description={t.receivedServiceInvoicesDesc}'
    },
    {
        search: 'title="Verilen Hizmet Faturaları" description="Müşterilere verilen hizmetler"',
        replace: 'title={t.issuedServiceInvoicesTitle} description={t.issuedServiceInvoicesDesc}'
    }
];

let modified = false;
for (const r of replacements) {
    if (content.includes(r.search)) {
        content = content.replace(r.search, r.replace);
        modified = true;
    } else {
        console.log(`Could not find: ${r.search}`);
    }
}

if (modified) {
    fs.writeFileSync(translationsPath, content);
    console.log('Successfully replaced hardcoded titles in ManagementModule.tsx');
} else {
    console.log('No modifications made.');
}
