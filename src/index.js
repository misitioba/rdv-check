require('dotenv').config({
    silent:true
})
const express = require('express')
const playwright = require('playwright');
const browserType = 'firefox';
const app = express();
const schedule = require('node-schedule');
const sander = require('sander');
const renderApp = require('./renderer')
let momentTZ = require('moment-timezone')
moment = (m) => momentTZ(m).tz('Europe/Paris')

schedule.scheduleJob('*/30 * * * *', isRdvAvailableTask);

app.use('/',express.static('public'))
app.get('/',async (req,res)=>{
    try{
        res.send(`
        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DÉPÔT DE DOSSIER – ETRANGERS EN SITUATION RÉGULIÈRE: Vérification de disponibilité</title>
</head>
<body>
    ${await renderApp()}
</body>
</html>
        `)
    }catch(err){
        console.error('ERROR',err.message,err.stack)
        res.send(500)
    }
})
app.listen(process.env.PORT||3000, ()=>console.log(`LISTEN ${process.env.PORT||3000}`))

async function isRdvAvailableTask(){
    isRdvAvailable().then(async isAvailable => {
        let stats = JSON.parse((await sander.readFile(process.cwd()+'/public/stats.json')).toString('utf-8'))
        stats.lastCheck = moment()._d.getTime()
        stats.lastCheckFormatted = moment().format('DD-MM-YY HH[h]mm')
        await sander.writeFile(process.cwd()+'/public/stats.json',JSON.stringify(stats,null,4))
    })
}

async function isRdvAvailable() {
    let url = 'http://www.herault.gouv.fr/Actualites/INFOS/Usagers-etrangers-en-situation-reguliere-Prenez-rendez-vous-ici';
    const browser = await playwright[browserType].launch({
        headless: true
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    url = await page.$eval('img[title="Prendre rendez-vous"]', el => el.parentNode.href)
    await page.goto(url)
    await page.click('input[name="condition"]')
    await page.click('input[name="nextButton"')

    await page.waitForFunction(() => {
        return !!document.querySelector('#global_Booking')
    })
    let notAvailable = await page.$eval('form[name="create"]', el => {
        return el.innerHTML.indexOf('existe plus') !== -1
    })
    let photoPath = await savePhotoInfo(!notAvailable)
    await page.screenshot({ path: photoPath });
    await optimizeImage(photoPath)
    await browser.close();
    return !notAvailable
};

async function savePhotoInfo(isAvailable){
    let stats = JSON.parse((await sander.readFile(process.cwd()+'/public/stats.json')).toString('utf-8'))
    stats.photos = stats.photos || [];
    let id = moment().format('DD[_]MM[_]YY[_]HH[_]mm')
    if(stats.photos.indexOf(id)===-1){
        stats.photos.push(id)
    }
    if(isAvailable){
        stats.photosAvail = stats.photosAvail || [];
        stats.photosAvail.push(id)
    }
    await sander.writeFile(process.cwd()+'/public/stats.json',JSON.stringify(stats,null,4))
    return process.cwd()+`/public/photos/${id}.png`;
}

async function optimizeImage(path){
    const imagemin = require('imagemin');
    const pngToJpeg = require('png-to-jpeg');
    const files = await imagemin([path], {
        destination:process.cwd()+'/public/photos',
        plugins: [
            pngToJpeg({quality: 30})
        ]
    });
}