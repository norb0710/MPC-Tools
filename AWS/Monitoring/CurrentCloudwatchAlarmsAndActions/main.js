const Excel = require('exceljs')
var AWS = require('aws-sdk')

// Import shared modules 
const utilities = require('../../SharedModules/utilities') 

async function main(config, sheet){

    // Set Column headers
    utilities.setupColumnHeaders(sheet, ['Service', 'Id', 'Name', 'Errors', 'Alarm Name', 'Alarm Threshold', 'Alarm State Action', 'Ok State Action'])

    var Ec2 = new AWS.EC2(config)
    var Sns = new AWS.SNS(config)

    // Get all alarm in the region
    var Cloudwatch = new AWS.CloudWatch(config)
    var cloudWatchAlarms = await Cloudwatch.describeAlarms().promise()

    // If no alarms are in place then skip to next region
    if (cloudWatchAlarms.MetricAlarms.length == 0){
            console.log("Total Number of Alarms: 0");
            console.log('-----------------------------------------------');
            utilities.noResourcesRow(sheet, 'No Alarms', 'H')
            return 
        }

    var nextToken = cloudWatchAlarms.NextToken
    var count = 0

    // If more than 50 alarms exist then retrive next 50 alarms until none are left
    while (nextToken !== undefined){
        var nextBatch = await Cloudwatch.describeAlarms({NextToken: nextToken}).promise()
        
        count += 1
                
        // Add the new batch of alarms to the existing alarms
        cloudWatchAlarms.MetricAlarms = cloudWatchAlarms.MetricAlarms.concat(nextBatch.MetricAlarms)
        nextToken = nextBatch.NextToken
    }

    const instances = await Ec2.describeInstances().promise()
      
    // Group alarms by resource
    var resourceToAlarmMap = groupAlarmsByResourceType(cloudWatchAlarms)

    // Sort by key 
    resourceToAlarmMap = new Map([...resourceToAlarmMap.entries()].sort())

    for (var [mapKey, mapValue] of resourceToAlarmMap.entries()) {
        // resourceToAlarmMap.forEach((value, key) => {

        // Get resource id
        const resourceId = mapKey
        // console.log('Resource Id: ' + resourceId);

        // Get instance name 
        var instanceName = utilities.getEc2NameTagValue(resourceId, instances)
        // console.log('Instance Name: ' + instanceName);

        var formattedRowData = new Array()

        var count = 1

        // Get alarm details
        for (const alarm of mapValue) {

            // Get Alarm Name
            const alarmName = alarm.AlarmName
            // console.log('Alarm Name: ' + alarmName);

            // Get Alarm Threshold
            const alarmThreshold = getNonTechnicalAlarmThreshold(alarm)
            // console.log('Alarm Threshold: ' + alarmThreshold);

            // Get Cloudwatch alarm Action(s)
            const subscriptionsResponse = await Sns.listSubscriptions().promise()
            const alarmActions = getNonTechnicalAlarmAction(alarm.AlarmActions, subscriptionsResponse)
            // console.log('Alarm Action: ' + alarmAction);

            // Get Cloudwatch OK Action(s)
            const okActions = getNonTechnicalAlarmAction(alarm.OKActions, subscriptionsResponse)    
                  
            // Get Alarm Namespace
            const alarmNamespace = getService(alarm, resourceId)
            // console.log('Alarm ANamespace: ' + alarmNamespace + '\n');

            formattedRowData.push({resourceId: resourceId, instanceName: instanceName, alarmName: alarmName, alarmThreshold: alarmThreshold, alarmAction: alarmActions, okAction: okActions, alarmNamespace: alarmNamespace})
                
            count += 1
        }

        // Check that the required alarms are in place
        const missingAlarms  = findMissingAlarms(mapValue)

        formattedRowData.forEach((element) => {

            if(element.resourceId == mapKey){
                element['errors'] = missingAlarms
            }

        })

        // Add the formatted data as rows to the spreadsheet
        addAlarmRows(sheet, formattedRowData)
    
    }
    
}

function addAlarmRows(sheet, formattedRowData){

    // Sort object by service
    // formattedRowData.sort(compareValues('alarmNamespace'))
    

    // Add instance details row
    var numberOfResourceAndNameRows = 0
    var startRow = 0
    var resourceIdTracker = ''

    formattedRowData.forEach((element) => {           

        var row = sheet.addRow([element.alarmNamespace, element.resourceId, element.instanceName, element.errors, element.alarmName, element.alarmThreshold, element.alarmAction, element.okAction])          

        // There will always be resource id
        if (resourceIdTracker !== element.resourceId) {
            resourceIdTracker = element.resourceId
            startRow = row.number
        } else {
            numberOfResourceAndNameRows += 1
        }

        utilities.addBoarders(row, Object.keys(element).length)

        // Wrap text for the alarm action column
        row.getCell(Object.keys(element).length - 1).alignment = { wrapText: true }

        // Wrap text for the ok action column
        row.getCell(Object.keys(element).length).alignment = { wrapText: true }

        // Wrap text for the errors column
        row.getCell(Object.keys(element).length - 4).alignment = { wrapText: true }        

    })

    // Merge the row in each the alarms are assigned to the same resource. For better readability
    if (numberOfResourceAndNameRows !== 1){
        sheet.mergeCells('A' + startRow + ':' + 'A' + (startRow + numberOfResourceAndNameRows))
        sheet.mergeCells('B' + startRow + ':' + 'B' + (startRow + numberOfResourceAndNameRows))
        sheet.mergeCells('C' + startRow + ':' + 'C' + (startRow + numberOfResourceAndNameRows))
        sheet.mergeCells('D' + startRow + ':' + 'D' + (startRow + numberOfResourceAndNameRows))
    }

}

function groupAlarmsByResourceType(cloudWatchAlarms){

    console.log("Total Number of Alarms: " + cloudWatchAlarms.MetricAlarms.length);
    

    var resourceToAlarmMap = new Map()

    var count = 0
    for (const cloudwatchAlarm of cloudWatchAlarms.MetricAlarms) {

    
        var resource = ""
        // If there are no Dimeensions (property used to determine which AWS service it is) then place "other"
        if(cloudwatchAlarm.Dimensions.length == 0){
            // Use Metric name in place of service name
            if(cloudwatchAlarm.Metrics[1] == undefined){
                console.log('The metric is undefined it so this should be skipped');
                
                continue;
                
            }

            try {

                if(cloudwatchAlarm.Metrics[1].MetricStat.Metric.Dimensions[0].Name !== undefined){
                    resource = cloudwatchAlarm.Metrics[1].MetricStat.Metric.Dimensions[0].Value
                }else{
                    resource = "No Resource Infomation"
                }
                
            } catch (error) {
                resource = "No Resource Infomation"                
            }            
            
        }else {
            resource = cloudwatchAlarm.Dimensions[0].Value
        }
        
        // If the key doesn't exist then set it 
        if (!resourceToAlarmMap.has(resource)){
            resourceToAlarmMap.set(resource, new Array(cloudwatchAlarm))
        } else {
            resourceToAlarmMap.get(resource).push(cloudwatchAlarm)
        }

        count += 1
        
   }

   return resourceToAlarmMap

}

function getNonTechnicalAlarmAction(cloudwatchActions, subscriptionsResponse){

    var actions = ''

    // Need a better way to match the ASG scale up and down policies
    const alarmActionsDict = {
        'AWS_EC2.InstanceId.Reboot': '- Reboot Instance\n',
        'ec2:recover': '- Recover Instance\n',
        'EC2ScaleUp': '- Scale up number of instances\n',
        'Scale Up': '- Scale up number of instances\n',
        'Scale Down': '- Scale up number of instances\n',
        'EC2ScaleDown': '- Scale down number of instances\n',
        'DynamoDBWriteCapacityUtilization': 'Scale write capacity according to Auto Scaling min and max\n',
        'DynamoDBReadCapacityUtilization': 'Scale read capacity according to Auto Scaling min and max\n',
        'rackspace-support-emergency': '- Create or update an existing Rackspace emergency ticket\n',
        'rackspace-support-standard': '- Create or update an existing Rackspace standard ticket\n',
        'rackspace-support-urgent': ' - Create or update an existing Rackspace Urgent ticket\n'
    }

    // If no alarm actions then skip
    if(cloudwatchActions.length > 0 ){
        for(const action of cloudwatchActions){

            // Replace action with user friendly action
            for (const key in alarmActionsDict){
                if(action.includes(key)){
                    actions += alarmActionsDict[key]
                }
            }
        }

        // Get emails for Alarm actions, ASSUMPTION: Rackspace SNS topics do not have email endpoints

    //     var subNextToken = undefined

    //     if(subscriptionsResponse !== undefined){

    //         subNextToken = subscriptionsResponse.NextToken

    //         // If more than 100 subscriptions exist then retrive next 100 subscriptions until none are left
    //         while (subNextToken !== undefined){
    //             var nextSubscriptionsBatch = await Sns.listSubscriptionsByTopic({TopicArn: action, NextToken: subNextToken}).promise()
        
    //             // Add the new batch of subscriptions to the existing subscriptions
    //             subscriptionsResponse.Subscriptions = subscriptionsResponse.Subscriptions.concat(nextSubscriptionsBatch.Subscriptions)
    //             subNextToken = nextSubscriptionsBatch.NextToken

    //     }

    // }



        actions = getEmailsFromSnsTopic(cloudwatchActions, actions, subscriptionsResponse)
        
    }

    if(actions == ''){
        actions = 'No Cloudwatch Actions'
    }
   
    return actions

}

function getEmailsFromSnsTopic(cloudwatchActions, actions, subscriptions){

    for(const action of cloudwatchActions){
        
        for(const subscription of subscriptions.Subscriptions){
            if(subscription.Protocol == 'email' && action == subscription.TopicArn){
                actions += '- Send Email to: ' + subscription.Endpoint + '\n'
            }
        }
        
    }




    
                    
        // for(const action of cloudwatchActions){
        
        // // Check if it is a SNS topic otherwise skip
        // if(action.includes('arn:aws:sns:')){

        //     var subNextToken = undefined

        //     try {
        //         var subscriptionsResponse = await Sns.listSubscriptionsByTopic({TopicArn: action}).promise()    
        //     } catch (error) {
        //         actions += "Topic with the following ARN doesn't exist: " + action
        //     }
            
        //     if(subscriptionsResponse !== undefined){
        //         subNextToken = subscriptionsResponse.NextToken

        //         // If more than 100 subscriptions exist then retrive next 100 subscriptions until none are left
        //         while (subNextToken !== undefined){
        //             var nextSubscriptionsBatch = await Sns.listSubscriptionsByTopic({TopicArn: action, NextToken: subNextToken}).promise()
        
        //             // Add the new batch of subscriptions to the existing subscriptions
        //             subscriptionsResponse.Subscriptions = subscriptionsResponse.Subscriptions.concat(nextSubscriptionsBatch.Subscriptions)
        //             subNextToken = nextSubscriptionsBatch.NextToken
        //         }

        //         // Ignore anything that isn't a email
        //         subscriptionsResponse.Subscriptions.forEach((subscription) => {
        //             if(subscription.Protocol == 'email'){
        //                 actions += '- Send Email to: ' + subscription.Endpoint + '\n'
        //             }
        //         })

        //     }

            
        // }                   
        
        // }
    

    return actions

}

function getNonTechnicalAlarmThreshold(alarm){

    var metricname = alarm.MetricName

    const comparisonOperators = {
        'GreaterThanOrEqualToThreshold': '>=',
        'LessThanOrEqualToThreshold': '<=',
        'GreaterThanThreshold': '>',
        'LessThanThreshold': '<'
    }
    
    const merticUnit = {
        'CPUUtilization': '%'
    }

    if(metricname == undefined){
        metricname = alarm.Metrics[0].Label
    }

    return metricname + ' ' + comparisonOperators[alarm.ComparisonOperator] + ' ' + alarm.Threshold + (merticUnit[alarm.MetricName] == undefined ? '' : merticUnit[alarm.MetricName]) + ' for ' + alarm.EvaluationPeriods + ' datapoints within the last ' + ((alarm.EvaluationPeriods * alarm.Period)/60) + ' minutes'

}

function getService(alarm, resourceId) {

    if(alarm.Namespace == undefined){   
        if(alarm.Metrics[1].MetricStat == undefined){
            return 'no namespace'
        }      
        return alarm.Metrics[1].MetricStat.Metric.Namespace.replace('AWS/', '')
    }else if(alarm.Namespace.includes('AWS/')){
        return alarm.Namespace.replace('AWS/', '')
    } else if (resourceId.substring(0, 2) == 'i-'){
        return 'EC2'
    }else if (alarm.Namespace.includes('System/Linux')){
        return 'EC2'
    }
    

}

function autoAdjustHeightAndWidth(sheet){



    for (var i = 0; i < 6; i++){

        var longestRow = 0 

        var column = sheet.getColumn(i)

        //Find the longest row with the longest lenght item 
        column.eachCell(function(cell, rowNumber) {
            if(cell.value.length > longestRow){
                longestRow = cell.value.length
            }
        });


        column.width = longestRow + 5

    }

}

function findMissingAlarms(alarms){
    
    const requireAlarms = [
        {alarmname: 'StatusCheckFailedInstance', present: false, namespace: ''}, 
        {alarmname: 'StatusCheckFailedSystem', present: false, namespace: ''}, 
        {alarmname: 'DiskSpace', present: false, namespace: ''}
    ]

    alarms.forEach((alarm) => {
        
        if(alarm.Namespace == 'AWS/EC2'){

            requireAlarms.forEach((requireAlarm) => {

                requireAlarm.namespace = alarm.Namespace
        
                if(alarm.AlarmName.includes(requireAlarm.alarmname)){
                    requireAlarm.present = true
                }
                
    
            })

        }

    })

    var errors = ''

    requireAlarms.forEach((alarm) => {

        if(alarm.namespace == 'AWS/EC2'){

            if(alarm.present == false){
                errors += '- ' + alarm.alarmname + ' alarm is missing\n'
            }

        }

    })

    return errors

}

module.exports = { main }