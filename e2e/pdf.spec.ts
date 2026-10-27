import {test,expect} from '@playwright/test';
function fixturePdf(){
 const stream=(s:string)=>`<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
 stream('BT /F1 12 Tf 50 740 Td (Lesen Teil 1) Tj 0 -30 Td (Die Rechnung ist wichtig.) Tj ET'),
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
 stream('BT /F1 12 Tf 50 740 Td (Sprechen Teil 2) Tj 0 -30 Td (Wir arbeiten zusammen.) Tj ET'),
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let pdf='%PDF-1.4\n';const offsets:number[]=[];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=Buffer.byteLength(pdf);
 pdf+='xref\n0 8\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(pdf);
}
test('imports a PDF locally, reviews a card, preserves progress, exports and opens the stored PDF',async({page})=>{
 const errors:string[]=[];const apiRequests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))apiRequests.push(r.url());});
 await page.goto('./');await expect(page.getByRole('heading',{name:'Deutsch B2 Beruf Trainer'})).toBeVisible();
 await page.getByRole('tab',{name:'Материалы'}).click();await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({name:'Без ответов.pdf',mimeType:'application/pdf',buffer:fixturePdf()});
 await expect(page.getByText(/PDF импортирован: 2 страниц/)).toBeVisible();await expect(page.locator('.pdf-source-list article')).toHaveCount(1);
 // Duplicate import does not increase frequency or create another document.
 await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({name:'duplicate.pdf',mimeType:'application/pdf',buffer:fixturePdf()});await expect(page.getByText(/Этот PDF уже импортирован/)).toBeVisible();await expect(page.locator('.pdf-source-list article')).toHaveCount(1);
 await page.getByRole('tab',{name:'Словарь',exact:true}).click();await page.getByRole('textbox',{name:'Поиск слова'}).fill('Rechnung');await expect(page.locator('.pdf-word')).toHaveCount(1);await page.locator('.pdf-word').click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByText('Die Rechnung ist wichtig.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.getByRole('tab',{name:'Практика',exact:true}).click();await page.getByRole('button',{name:'Карточки',exact:true}).click();await page.getByRole('button',{name:'Начать занятие'}).click();await expect(page.getByRole('button',{name:'Показать перевод'})).toBeVisible();await expect(page.locator('.pdf-feedback')).toHaveCount(0);await page.getByRole('button',{name:'Показать перевод'}).click();await page.getByRole('button',{name:'Помню',exact:true}).click();await expect(page.getByText(/Сохранено на устройстве/)).toBeVisible();
 await page.reload();await page.getByRole('tab',{name:'Прогресс',exact:true}).click();await expect(page.getByText('100% верных ответов')).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт JSON'}).click();const file=await download;expect(file.suggestedFilename()).toBe('deutsch-b2-progress.json');
 await page.getByRole('tab',{name:'Материалы'}).click();const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Открыть PDF'}).click();const pdf=await popup;await expect.poll(()=>pdf.url()).toContain('blob:');await pdf.close();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(apiRequests).toEqual([]);expect(errors).toEqual([]);
});
test('reopens offline and imports a PDF without an API or CDN',async({page,context})=>{
 await page.goto('./');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 // Wait for the cache to contain the PDF worker and dynamic PDF.js code before going offline.
 await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Deutsch B2 Beruf Trainer'})).toBeVisible();
 await page.getByRole('tab',{name:'Материалы'}).click();await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({name:'offline.pdf',mimeType:'application/pdf',buffer:fixturePdf()});await expect(page.getByText(/PDF импортирован: 2 страниц/)).toBeVisible();await expect(page.locator('.pdf-source-list article')).toHaveCount(1);
});
