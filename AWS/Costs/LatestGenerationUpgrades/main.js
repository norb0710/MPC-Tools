var AWS = require('aws-sdk')
var Excel = require('exceljs')
const fs = require('fs')
const { Parser } = require('json2csv');
const argv = require('yargs').argv

// Import shared modules 
const authentication = require('../../SharedModules/authentication')
const utilities = require('../../SharedModules/utilies')

async function Main(){

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

// Create JSON parser

const fields = ['Instance', 'Name', 'AWS Account Number', 'State', 'Availability Zone', 'Platform Type', 'Platform Name', 'Instance Type', 'Latest Instance Type', 'VPC', 'Monthly Savings', 'Notes']
const opts = { fields }
const json2csvParser = new Parser(opts)
var entries = []



// Run through all the accounts using the credentails map
for (const [key, value] of credsMap.entries()) {
    
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

    // Get a list of all EC2 resources per region
    try {
    
        for(const regionSet of regions.Regions) {

            // Set region heading
            setupRegionHeading(sheet, regionSet)

            config.region = regionSet.RegionName        
            

            // Set Column headers
            setupColumnHeaders(sheet)

            var Ec2 = new AWS.EC2(config)
            var Ssm = new AWS.SSM(config)

            const instances = await Ec2.describeInstances().promise()

             // If no instances then skip region
            if(instances.Reservations.length == 0){
                continue
            }

            
            const instanceSystemInfo = await Ssm.describeInstanceInformation().promise()

            var listOfInstances = []

            
            for(let i = 0; i < instances.Reservations.length; i++){
                listOfInstances = listOfInstances.concat(instances.Reservations[i].Instances)
            }

            for (let i = 0; i < listOfInstances.length; i++) {
                
                const instanceId = listOfInstances[i].InstanceId
                const instanceName = utilities.getEc2NameTagValue(instanceId, instances)
                const region = regionSet.RegionName
                const state = listOfInstances[i].State.Name
                const platformNameAndPlatformType = getPlatformNameAndPlatformType(instanceId, instanceSystemInfo)
                const availabilityZone = listOfInstances[i].Placement.AvailabilityZone
                const instanceType = listOfInstances[i].InstanceType
                const vpcId = listOfInstances[i].VpcId
                const awsNumber = key
                let notes = ""

                // Check if the instance is the latest generation
                const isInstanceLatestGeneration = isLatestGeneration(instanceType)                
          
                // Skip the instance if it is already the latest generation
                if(isInstanceLatestGeneration.result == true){
                    console.log("instance type that needs upgrade: " + instanceType + ' It should be upgraded to: ' + isInstanceLatestGeneration.latestGeneration);
    
                }else{
                    continue
                }

                let currentHourlyPrice = null
                let futureHourlyPrice = null

                // Get the current pricing
                if(platformNameAndPlatformType.platformType.length == 0){
                    notes = "No SSM agent installed or configured on: " + instanceId
                    console.log("No SSM agent installed or configured on: " + instanceId);
                }else {
                    currentHourlyPrice = getCurrentHourlyPrice(region, instanceType, platformNameAndPlatformType.platformName, platformNameAndPlatformType.platformType)
                    futureHourlyPrice = getCurrentHourlyPrice(region, isInstanceLatestGeneration.latestGeneration, platformNameAndPlatformType.platformName, platformNameAndPlatformType.platformType)
                }

                // Calculate monthly savings 
                const currentMonthlyCost = currentHourlyPrice * 732
                const futureMonthlyCost = futureHourlyPrice * 732
                const monthlySavings = currentMonthlyCost - futureMonthlyCost


                
                // A null indicates that a mapping is not in place for the platform name and type
                if(currentHourlyPrice !== null){
                    console.log(platformNameAndPlatformType.platformName);
                    console.log(platformNameAndPlatformType.platformType);
                    console.log("Hourly price is $" + currentHourlyPrice + " for type: " + instanceType + ' Once upgraded the price will be $' + futureHourlyPrice + ' for ' + isInstanceLatestGeneration.latestGeneration);
                }else{
                    console.log('No pricing mapping for ' + platformNameAndPlatformType.platformName + " and " + platformNameAndPlatformType.platformType );       
                }

                entries.push({'Instance': instanceId, 
                              'Name': instanceName, 
                              'AWS Account Number': awsNumber, 
                              'State': state, 
                              'Availability Zone': availabilityZone, 
                              'Platform Type': platformNameAndPlatformType.platformType,
                              'Platform Name': platformNameAndPlatformType.platformName,
                              'Instance Type': instanceType,
                              'VPC': vpcId,
                              'Monthly Savings': monthlySavings,
                              'Notes': notes
                            })
                
            }
            
            
        console.log('-----------------------------------------------');
        
        // Add a couple of rows of gap between the regions
        sheet.addRow([''])
        sheet.addRow([''])
       
       
    }

    // autoAdjustHeightAndWidth(sheet)
        
    } catch (error) {
        console.log(error);
    
    }

  }

// Produce the report 
const csv = json2csvParser.parse(entries);
fs.writeFileSync('data.csv', csv)
workbook.xlsx.writeFile('Cloudwatch Alarms Report.xlsx')    
    
}

function setupRegionHeading(sheet, regionSet){

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
            "sa-east-1": "South America (São Paulo)",
            "us-gov-west-1": "US Gov West 1",
            "us-gov-east-1": "US Gov East 1"
        } 

        console.log(regionSet.RegionName + ' - ' + fullRegionName[regionSet.RegionName]);
        
        var regionRow = sheet.addRow([fullRegionName[regionSet.RegionName]])
        regionRow.font = {size: 16, bold: true}
            
        sheet.mergeCells('A' + regionRow.number + ':' + 'G' + regionRow.number)

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

function setupColumnHeaders(sheet){

    const columnHeaders = new Array('Instance', 'Name', 'AWS Account Number', 'State', 'Availability Zone', 'Platform Type', 'Platform Name', 'Instance Type', 'VPC' )
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

function getPlatformNameAndPlatformType(instanceId, instanceSystemInfo){

    var platformName = ""
    var platformType = ""

    instanceSystemInfo.InstanceInformationList.forEach(instance => {
        
        if(instance.InstanceId == instanceId){
            platformName = instance.PlatformName 
            platformType = instance.PlatformType
        }

    })

    return {
        platformName: platformName,
        platformType: platformType
    }

}

function isLatestGeneration(currentType){

    // A mapping of the instance family to its latest generation 
    const instanceTypeMapping = new Map([
        ['t', 't3'],
        ['m', 'm5'],
        ['a', 'a1'],
        ['c', 'c5'],
        ['r', 'r5'],
        ['x', 'x1'],
        ['z', 'z1'],
        ['p', 'p2'],
        ['g', 'g4'],
        ['f', 'f1'],
        ['i', 'i3'],
        ['d', 'd2'],
        ['h', 'h1']
    ])

    let needsUpgrade = null

    instanceTypeMapping.forEach((value, key, map) => {

        //Check whether the mapping exsists
        if(instanceTypeMapping.has(currentType.substr(0,1))){
            
            const currentGeneration = currentType.substr(0,2)
            const latestGeneration = instanceTypeMapping.get(currentType.substr(0,1))

            if(currentGeneration == latestGeneration){

                
                needsUpgrade = {'result': false, 'latestGeneration': null}
            }else{
                
                needsUpgrade = {'result': true, 'latestGeneration': (latestGeneration + currentType.substr(2, currentType.length-1)) }
            }

        }else{
            console.log('Instance family "' + currentType + '" not found');           
        }

    })

    return needsUpgrade

}

function getCurrentHourlyPrice(region, instanceType, platformName, platformType){

    // Read the pricing and platform information
    let pricingInfo = require('./pricing.json')
    let platformMapping = require('./platformMapping.json')
    let hourlyPricing = null

    const pricingForRegion = pricingInfo[region]
    
    pricingForRegion.forEach((instancePricing) => {

        // If the object which matches the instane type
        if(instancePricing.instanceType == instanceType){

            const osMap = platformMapping[platformType]
            console.log("osmaps" + JSON.stringify(osMap));
            
            console.log('platformanem ' + platformName);
            
            for (var property in osMap){
                if(platformName.includes(property)){
                    const os = osMap[property]
                    hourlyPricing = instancePricing[os]
                }
            }

        }
 
    })    

    return hourlyPricing

}

Main()