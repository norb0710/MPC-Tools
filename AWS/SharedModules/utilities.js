const Excel = require('exceljs')
const AWS = require('aws-sdk')
var fs = require('fs')

/**
 * 
 * Description: This function get the name tag value from EC2 resource
 * 
 * @param {*} instanceId 
 * @param {*} instances 
 */
function getEc2NameTagValue(instanceId, instances){

    for (const instance of instances.Reservations){

        if(instance.Instances[0].InstanceId == instanceId){

            // Find the name tag
            for (const tag of instance.Instances[0].Tags){
                if (tag.Key == 'Name'){
                    return tag.Value
                }
            }
        }           
    }

    return ''

}

function setupRegionHeading(sheet, regionSet, mergeTo){

    // Full name of regions 
    const fullRegionName = {
        "us-east-1": "US East (N. Virginia)",
        "us-east-2": "US East (Ohio)",
        "us-west-1": "US West (N. California)",
        "us-west-2": "US West (Oregon)",
        "ca-central-1": "Canada (Central)",
        "eu-west-1": "EU (Ireland)",
        "eu-central-1": "EU (Frankfurt)",
        "eu-west-2": "EU (London)",
        "eu-west-3": "EU (Paris)",
        "eu-north-1": "EU (Stockholm)",
        "ap-northeast-1": "Asia Pacific (Tokyo)",
        "ap-northeast-2": "Asia Pacific (Seoul)",
        "ap-southeast-1": "Asia Pacific (Singapore)",
        "ap-southeast-2": "Asia Pacific (Sydney)",
        "ap-south-1": "Asia Pacific (Mumbai)",
        "ap-east-1": "Asia Pacific (Hong Kong)",
        "sa-east-1": "South America (São Paulo)",
        "me-south-1": "Middle East (Bahrain)",
        "us-gov-west-1": "US Gov West 1",
        "us-gov-east-1": "US Gov East 1"
    } 

    console.log(regionSet.RegionName + ' - ' + fullRegionName[regionSet.RegionName]);
    
    var regionRow = sheet.addRow([fullRegionName[regionSet.RegionName]])
    regionRow.font = {size: 16, bold: true}
        
    sheet.mergeCells('A' + regionRow.number + ':' + mergeTo + regionRow.number)

    regionRow.getCell(1).alignment = {
        vertical: 'middle', 
        horizontal: 'center'
    }

    regionRow.getCell(1).border = {
        top: {style:'thin'},
        left: {style:'thin'},
        bottom: {style:'thin'},
        right: {style:'thin'}
    }

}

function setupColumnHeaders(sheet, columnHeaders){

    var headingRow = sheet.addRow(columnHeaders)

    for (var i = 1; i <= columnHeaders.length;  i++){
        
        // Set font
        headingRow.getCell(i).font = {
            size: 12,
            color: {argb: 'ffffff'},
            bold: true
        }    

        // Set 
        headingRow.getCell(i).border = {
            top: {style:'thin'},
            left: {style:'thin'},
            bottom: {style:'thin'},
            right: {style:'thin'}
        }

        headingRow.getCell(i).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor:{argb:'FFFF0000'}
        }

    }

}

function noResourcesRow(sheet, message, endCol) {

    var noAlarmsRow = sheet.addRow([message])
    noAlarmsRow.font = {size: 14, bold: true}
            
    sheet.mergeCells('A' + noAlarmsRow.number + ':' + endCol + noAlarmsRow.number)

    noAlarmsRow.getCell(1).alignment = {
        vertical: 'middle', 
        horizontal: 'center'
    }

    noAlarmsRow.getCell(1).border = {
        top: {style:'thin'},
        left: {style:'thin'},
        bottom: {style:'thin'},
        right: {style:'thin'}
    }

    sheet.addRow([''])
    sheet.addRow([''])

}

function addBoarders(row, numberOfCols){

    for(var i = 1; i <= numberOfCols; i++){
            
        row.getCell(i).border = {
            top: {style:'thin'},
            left: {style:'thin'},
            bottom: {style:'thin'},
            right: {style:'thin'}
        }

        row.getCell(i).alignment = {
            vertical: 'middle', 
            horizontal: 'center'
        }
    }

}

async function uploadReportToS3(filePath, Ddi, reportType){

    // Today's Date
    var today = new Date()
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate()

    const file = await fs.readFile(filePath)

    const s3 = AWS.S3()

    var params = {
        Body: file, 
        Bucket: "customer-audit-reports", 
        Key: Ddi + '/' + date + '/' + reportType + ' Audit Report.xlsx'
       };

    try {
        let result = await s3.putObject(params).promise()    
    } catch (error) {
        console.log(error);
    }
}

module.exports = { getEc2NameTagValue, setupRegionHeading, setupColumnHeaders, noResourcesRow, addBoarders, uploadReportToS3 }