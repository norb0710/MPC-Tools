var AWS = require('aws-sdk')
const Excel = require('exceljs')
require('colors')
var Diff = require('diff');
const fs = require('fs')
const PDFDocument = require('pdfkit');

// Import shared modules 
const authentication = require('../../SharedModules/authentication')

async function Main(){

    var cloudformation = new AWS.CloudFormation();

    // Read in credentials
    var credsMap = new Map()

    try {

        credsMap = authentication.extractCredentials(1095013, "rahu4105", 77763375)

    } catch (error) {
        console.log(error)
    }

    // Run through all the accounts using the credentails map
    for (const [key, value] of credsMap.entries()) {

        var config = {
            accessKeyId: credsMap.get(key).accessKey,
            secretAccessKey: credsMap.get(key).secertAccessKey,
            sessionToken: credsMap.get(key).sessionToken,
            region: 'eu-west-1' 
        }

        var cloudformation = new AWS.CloudFormation(config);

        // Get all stack names 
        const stacknamesUnformatted = await cloudformation.describeStacks({}).promise()

        var nextToken = stacknamesUnformatted.NextToken

        // If more than 50 alarms exist then retrive next 50 alarms until none are left
        while (nextToken !== undefined){
            var nextBatch = await cloudformation.describeStacks({NextToken: nextToken}).promise()
                    
            // Add the new batch of alarms to the existing alarms
            stacknamesUnformatted.Stacks = stacknamesUnformatted.Stacks.concat(nextBatch.Stacks)
            nextToken = nextBatch.NextToken
        }

        let stacknamesFormatted = []
        
        stacknamesUnformatted.Stacks.forEach((stackObject) => {
            stacknamesFormatted.push(stackObject.StackName)
        })


        stacknamesFormatted = stacknamesFormatted.slice(1, 2)
        

        // Run rift detection
        for(const stackname of stacknamesFormatted) {

            const doc = new PDFDocument;
            doc.pipe(fs.createWriteStream(stackname + '.pdf'));

            console.log('-------------------------------------------------------------');
            console.log('Stackname: ' + stackname);
            doc.fontSize(20)
                .text('Stackname: ' + stackname);

            doc.moveDown()
            
            const stackDriftId = await cloudformation.detectStackDrift({StackName: stackname}).promise()

            let status = false
        
            var wait = ms => new Promise((r, j)=>setTimeout(r, ms))

            // While drift detection is still in progress poll, not ideal 
            while(status == false){
                let driftStatus = await cloudformation.describeStackDriftDetectionStatus({StackDriftDetectionId: stackDriftId.StackDriftDetectionId}).promise()
                if(driftStatus.DetectionStatus == 'DETECTION_COMPLETE'){
                    status = true
                }

                await wait(3000)
            }
            
            const resourceDriftResult = await cloudformation.describeStackResourceDrifts({StackName: stackname}).promise()


            

            resourceDriftResult.StackResourceDrifts.forEach((driftset) => {
                if(driftset.StackResourceDriftStatus == 'DELETED'){
                    console.log('Drift Result: Drifted');
                    // console.log('Resource ' + driftset.LogicalResourceId + ' has been deleted.');              
                } else if(driftset.StackResourceDriftStatus != 'IN_SYNC'){
                    console.log('Drift Result: Drifted');
                    console.log('-------------------- Expected Properties --------------------');

                    doc.fontSize(15)
                        .text('Cloudformation Properties');
            
                    doc.moveDown()

                
                    doc.fontSize(10)
                        .text(JSON.stringify(driftset.ExpectedProperties));
                    
            
                    doc.moveDown()

                    console.log('--------------------- Actual Properties ---------------------');
                    doc.fontSize(15)
                        .text('Console Properties');

                    doc.moveDown()

                    doc.fontSize(10)
                        .text(JSON.parse(driftset.ActualProperties));
            
                    doc.moveDown()

                    doc.fontSize(15)
                    .text('Difference');

                    doc.moveDown()

                    var diff = Diff.diffJson(JSON.parse(driftset.ExpectedProperties), JSON.parse(driftset.ActualProperties))

                    diff.forEach((part) => {
                        
                        
                        var color = part.added ? 'green' :
                                    part.removed ? 'red' : 'grey';
                    process.stderr.write(part.value[color]);

                    if(part.added) {
                        doc.fontSize(10)
                            .fillColor('green')
                            .text(part.value)
                    }else if (part.removed) {
                        doc.fontSize(10)
                            .fillColor('red')
                            .text(part.value)
                    }else {
                        doc.fontSize(10)
                            .fillColor('grey')
                            .text(part.value)
                    }




                    })                    

                    doc.moveDown()
                    doc.end();

                    console.log('--------------------------- Diff ---------------------------');
                   

                }

            
            })

        }




    



}

} 


function writePdf(){
    
   
}

Main()

