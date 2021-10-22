var AWS = require('aws-sdk')

const utilities = require('../SharedModules/utilities') 

async function main(config, sheet){

    var Ec2 = new AWS.EC2(config)

    const instances = await Ec2.describeInstances().promise()

    // If there are no resources then there won't be any maintenances windows
    if(instances.Reservations.length == 0){
        console.log("Total Number of Instances: 0");
        utilities.noResourcesRow(sheet, 'No auto recovery instances', 'E')      
        return 
    }

    // Get Maintenance Window information 

    // If the maintenance windows is 0 then report that 
    var Ssm = new AWS.SSM(config)
    const maintenances = await Ssm.describeMaintenanceWindows().promise()

    if(maintenances.WindowIdentities.length == 0){        
        utilities.noResourcesRow(sheet, 'No Maintenance windows configured', 'E')
        return
    }

    utilities.setupColumnHeaders(sheet, ['Maintenance Window Name', 'Enabled', 'Duration (hours)', 'Schedule', 'Targets'])

    let targetInfo = []

    for(const maintenance of maintenances.WindowIdentities){

        const targetsResult = await Ssm.describeMaintenanceWindowTargets({WindowId: maintenance.WindowId}).promise()

        // Check the targets of the maintenances
        let targetsMessage = ''

        // There may be more than one target
        targetsResult.Targets[0].Targets.forEach((target) => {
            
            targetsMessage += 'Key: ' + target.Key.replace('tag:', '') + ' Value: ' + target.Values + '\n'
            targetInfo.push({maintenanceName: maintenance.Name, targetValue: target.Values[0]})
        })
        
        
        var maintenanceRow = sheet.addRow([maintenance.Name, maintenance.Enabled, maintenance.Duration, maintenance.Schedule, targetsMessage])
        utilities.addBoarders(maintenanceRow, 5)

    }

    console.log(targetInfo);
    

    sheet.addRow([''])
    sheet.addRow([''])

    utilities.setupColumnHeaders(sheet, ['Instance Id', 'Patch Group Tag Present', 'Patch Group Tag Value', 'Maintenance Window Name', 'Errors'])

    // Check that the instances aren't part of a autoscaling group and if the Patch Group is present or not and with what value if present 
    let instancesMap = new Map()

    for (const instance of instances.Reservations){

        instancesMap.set(instance.Instances[0].InstanceId, {patchGroupPresent: false, patchGroupValue: '', asgInstance: false, maintenanceWindow: '', message: ''})

        for (const tag of instance.Instances[0].Tags){
            if (tag.Key == 'Patch Group'){
                instancesMap.get(instance.Instances[0].InstanceId).patchGroupPresent = true
                instancesMap.get(instance.Instances[0].InstanceId).patchGroupValue = tag.Value
            }else if(tag.Key == 'aws:autoscaling:groupName'){
                instancesMap.get(instance.Instances[0].InstanceId).asgInstance = true
            }
        }   

    }

    instancesMap.forEach((value, key) => {
        
        // If it isn't a ASG Instance 
        if(value.asgInstance == false){

            if (value.patchGroupPresent && value.patchGroupValue == '') {
                value.message += 'No Patch Group tag value present'
            } else if(value.patchGroupPresent == false){
                value.message += 'No "Patch Group" tag present'
            }else if(value.patchGroupValue !== ''){
        
                // Check whether any of tags associated with the Targets is present within the list of tags for the instance
                let foundMaintenanceWindow = false

                targetInfo.forEach((pair) => {                    

                    if(pair.targetValue == value.patchGroupValue){
                        value.maintenanceWindow = pair.maintenanceName
                        foundMaintenanceWindow = true

                    }
                })

                if(foundMaintenanceWindow == false){                    
                    value.message += 'No Maintenance Window associated with this instance'
                }

            }

        }   

    })

    // Add the rows to the spreadsheet
    instancesMap.forEach((value, key) => {

        var row = sheet.addRow([key, value.patchGroupPresent, value.patchGroupValue, value.maintenanceWindow, value.message])
        utilities.addBoarders(row, 5)

    })
    
}

module.exports = { main }