async function main(credsMap, key, utilities, sheet){
    
    // Go through each account and check if EBS Snapper is in place
        
    // Check EC2 standalone instances are being backed up
    const ebsSnapperDetails = await getEbsSnapperDetails(credsMap, key, arrayFormat)
    const ebsSnapperLambdaDetails = await getEbsSnapperLambdaDetails(credsMap, key, arrayFormat)
    const checkEc2TagsDetails = await checkEc2Tags(credsMap, key, arrayFormat)
                
    console.log('Frequency: ' + ebsSnapperDetails.frequency);
    console.log('Rentention: ' + ebsSnapperDetails.rentention);
    console.log('Minium Number of Snapshots: ' + ebsSnapperDetails.numberOfSnapshotsToRetain);

    if(ebsSnapperDetails.errors.length > 0){
        ebsSnapperDetails.errors.forEach(error => {
            console.log('Error: ' + error);
        })
    }

    if(ebsSnapperLambdaDetails.errors.length > 0){
        ebsSnapperLambdaDetails.errors.forEach(error => {
            console.log('Error: ' + error);
        })
    }

    if(checkEc2TagsDetails.size > 0){
        checkEc2TagsDetails.forEach(obj => {
            if(obj.message !== ''){
                console.log('Error: ' + obj.message);
            }
        })
    }
                
}

// Return the rentention period, frequency and minium snapshots
async function getEbsSnapperDetails(utilities, credsMap, key, AWS, sheet){

    // Set Column headers
    utilities.setupColumnHeaders(sheet, ['Frequency', 'Rentention', 'Minium Number of Snapshots', 'Errors'])

    var config = {
        accessKeyId: credsMap.get(key).accessKey,
        secretAccessKey: credsMap.get(key).secertAccessKey,
        sessionToken: credsMap.get(key).sessionToken,
        region: 'us-east-1' 
    }

    var DynamoDB = new AWS.DynamoDB.DocumentClient(config)

    // Get the current EBS Snapper configuration 
    var param = {
        TableName: 'ebs_snapshot_configuration',
        KeyConditionExpression: "#aws_account_id = :aws_account_id",
        ExpressionAttributeNames:{
            "#aws_account_id": "aws_account_id"
        },
        ExpressionAttributeValues: {
            ":aws_account_id": credsMap.get(key).accountNumber
        }
    }

    let frequency = ''
    let rentention = ''
    let numberOfSnapshotsToRetain = ''
    let errors = []

    try {

        let result = await DynamoDB.query(param).promise()        

        const configuration = JSON.parse(result.Items[0].configuration)

        frequency = result.Items[0].id.replace('_tagged', '')
        rentention = configuration.snapshot.retention 
        numberOfSnapshotsToRetain = configuration.snapshot.minimum

    } catch (error) {
        // See if the configuration for EBS Snapper is present
        if(error.code == 'ResourceNotFoundException'){
            errors.push('EBS Snapper Config not Present')
        }

    }
    
    if(errors.length > 0){
        errors.forEach(error => {
            sheet.addRow([frequency, rentention, numberOfSnapshotsToRetain, error])
        })
    }          

    sheet.addRow([frequency, rentention, numberOfSnapshotsToRetain, ''])

    return {
        frequency: frequency,
        rentention: rentention,
        numberOfSnapshotsToRetain: numberOfSnapshotsToRetain,
        errors: errors
    }


}

async function getEbsSnapperLambdaDetails(credsMap, key, AWS, sheet){

    var config = {
        accessKeyId: credsMap.get(key).accessKey,
        secretAccessKey: credsMap.get(key).secertAccessKey,
        sessionToken: credsMap.get(key).sessionToken,
        region: 'us-east-1' 
    }

    var lambda = new AWS.Lambda(config);

    const results = await lambda.listFunctions().promise()

    let createSnapshotFunctionPresent = false
    let fanoutReplicationSnapshotPresent = false
    let cleanSnapshotFunctionPresent = false 

    results.Functions.forEach(lambdaFunction => {
        if(lambdaFunction.FunctionName.includes('CreateSnapshotFunction')){
            createSnapshotFunctionPresent = true
        }

        if(lambdaFunction.FunctionName.includes('FanoutReplicationSnapshot')){
            fanoutReplicationSnapshotPresent = true
        }

        if(lambdaFunction.FunctionName.includes('CleanSnapshotFunction')){
            cleanSnapshotFunctionPresent = true
        }
    })

    let errors = []

    if(createSnapshotFunctionPresent == false){
        errors.push('CreateSnapshotFunction Lambda function is missing')
    }
    if(fanoutReplicationSnapshotPresent == false){
        errors.push('fanoutReplicationSnapshot Lambda function is missing')
    }
    if(cleanSnapshotFunctionPresent == false){
        errors.push('cleanSnapshotFunction Lambda function is missing')
    }

    if(errors.length > 0){
        errors.forEach(error => {
            sheet.addRow(['', '', '', error])
        })
    }

    return {
        errors
    }

}

async function checkEc2Tags(utilities, config, key, AWS, sheet){

    // Set Column headers
    utilities.setupColumnHeaders(sheet, ['Instance', 'Backup Tag Present', 'Backup Tag Value', 'ASG Instance', 'Errors'])

    let instancesWithBackupTags = new Map()

    // Determine which EC2 instances are being backed up and which aren't via EBS Snapper
    var Ec2 = new AWS.EC2(config)

    const instances = await Ec2.describeInstances().promise()

    for (const instance of instances.Reservations){

        instancesWithBackupTags.set(instance.Instances[0].InstanceId, {backupTagPresent: false, backupTagValue: false, asgInstance: false, message: ''})

            // Find the Backup tag
            for (const tag of instance.Instances[0].Tags){
                if (tag.Key == 'Backup'){
                    instancesWithBackupTags.get(instance.Instances[0].InstanceId).backupTagPresent = true
                    instancesWithBackupTags.get(instance.Instances[0].InstanceId).backupTagValue = tag.Value
                }else if(tag.Key == 'aws:autoscaling:groupName'){
                    instancesWithBackupTags.get(instance.Instances[0].InstanceId).asgInstance = true
                }
            }    
        }

    instancesWithBackupTags.forEach((value, key) => {
        if(value.backupTagPresent == false){
            value.message = 'No Backup tag. No backups being taken\n'
        }else if(value.backupTagPresent == true && value.backupTagValue.toLowerCase() == 'false'){
            value.message = 'Backup tag present but it is set to "False". Not backups being taken'
        }
    })

    if(instancesWithBackupTags.size > 0){
        instancesWithBackupTags.forEach((obj, key) => {
            sheet.addRow([key, obj.backupTagPresent, obj.backupTagValue, obj.asgInstance, obj.message])
        })
    }
 
    return instancesWithBackupTags
   
}

async function checkRdsbackupStatus(credsMap, i, arrayFormat){

    var config = {
        accessKeyId: credsMap.get(arrayFormat[i]).accessKey,
        secretAccessKey: credsMap.get(arrayFormat[i]).secertAccessKey,
        sessionToken: credsMap.get(arrayFormat[i]).sessionToken,
        region: 'us-east-1' 
    }

    const regions = await new AWS.EC2(config).describeRegions().promise()

    for(const regionSet of regions.Regions) {

        config.region = regionSet.RegionName

        var rds = new AWS.RDS(config);

        // const results = rds.DescribeDBInstanceAutomatedBackups()

    }

    
    
    // DescribeDBInstanceAutomatedBackups

}

module.exports = { main, getEbsSnapperDetails, getEbsSnapperLambdaDetails, checkEc2Tags }