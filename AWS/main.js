const argv = require('yargs').argv
var AWS = require('aws-sdk')
const Excel = require('exceljs')
let converter = require('json-2-csv');
const fs = require('fs')
const { performance } = require('perf_hooks');
const fse = require('fs-extra')

// Import shared modules 
const authentication = require('../AWS/SharedModules/authentication')
const utilities = require('./SharedModules/utilities')

// Import audit modules 
const monitoringAudit = require('./Monitoring/CurrentCloudwatchAlarmsAndActions/main')
const backupAudit = require ('../AWS/Backup/main')
const patchingAudit = require('../AWS/Patching/main')

async function Main(){

    var t0 = performance.now();

    // Today's Date
    var today = new Date()
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate()

    // Read in credentials
    var credsMap = new Map()

    try {
        credsMap = authentication.extractCredentials(argv.DDI, argv.ssoUsername, argv.ssoTokenDD)
    } catch (error) {
        console.log(error)
    }

    // Initial Configuration, create spreadsheet
    var workbook = new Excel.Workbook()
    workbook.created = new Date()

    let monitoringData = []

    // Run through all the accounts using the credentails map
    for (const [key, value] of credsMap.entries()) {

        // Populate the list below if you only want to run the script for a specific subset of account within the DDI
        // const listofaccounts = []

        // var correctAccount = false

        // for(const account of listofaccounts){
        //     if(account == key){
        //         correctAccount = true
        //     }
        // }

        // if(correctAccount == false){
        //     continue
        // }

        // Name the sheet after the account name
        var sheet = workbook.addWorksheet(key)
        console.log('\n\n========' + key + '========');

        // Region in config doesn't matter for getting list of regions
        var config = {
            accessKeyId: credsMap.get(key).accessKey,
            secretAccessKey: credsMap.get(key).secertAccessKey,
            sessionToken: credsMap.get(key).sessionToken,
            region: 'us-east-1' 
        }

        const regions = await new AWS.EC2(config).describeRegions().promise()        

        try {

            for(const regionSet of regions.Regions) {

                config.region = regionSet.RegionName

                if(regionSet.RegionName == 'ap-east-1'){
                    continue
                    
                }

                if(argv.reportType == 'Monitoring'){
                    // Set region heading
                    utilities.setupRegionHeading(sheet, regionSet, 'H')

                    var t2 = performance.now();
                    let data = await monitoringAudit.main(config, sheet)
                    monitoringData = monitoringData.concat(data)
                    var t3 = performance.now();
                    console.log("region " + regionSet.RegionName + " took " + ((t3 - t2)/1000) + " seconds.");
                }else if(argv.reportType == 'Backups'){

                    
                    
                    if(regionSet.RegionName == 'us-east-1'){
                        utilities.setupRegionHeading(sheet, regionSet, 'D')
                        await backupAudit.getEbsSnapperDetails(utilities, credsMap, key, AWS, sheet)
                        await backupAudit.getEbsSnapperLambdaDetails(credsMap, key, AWS, sheet)
                    }else{
                        utilities.setupRegionHeading(sheet, regionSet, 'E')
                    }
                    
                    await backupAudit.checkEc2Tags(utilities, config, key, AWS, sheet)
                    // await backupAudit.main(credsMap, key)
                }else if(argv.reportType == 'Patching'){
                    utilities.setupRegionHeading(sheet, regionSet, 'E')
                    await patchingAudit.main(config, sheet)
                }
                
                
                
                console.log('-----------------------------------------------');
        
                // Add a couple of rows of gap between the regions
                sheet.addRow([''])
                sheet.addRow([''])

            }
            
        } catch (error) {
            console.log(error);
        }

    }

    // Create the Customers/<DDI> folder if it doesn't exist
    const dir = 'Customers/' + argv.DDI
    fse.ensureDirSync(dir)

    // Produce the report 
    const filepath = 'Customers/' + argv.DDI + '/' + argv.reportType + ' Audit Report.xlsx'

    workbook.xlsx.writeFile(filepath)
    // utilities.uploadReportToS3(filepath, argv.DDI, argv.reportType)

    // Export to CSV
    // converter.json2csvAsync(monitoringData)
    //                     .then((csvData) => fs.writeFileSync('/Users/rahu4105/OneDrive - Rackspace Inc/Data/Monitoring/monitoring-data-' + date + '.csv', csvData))
    //                     .catch((err) => console.log(err.message))

    var t1 = performance.now();

    console.log("Script took " + ((t1 - t0)/1000) + " seconds.");


}

Main()