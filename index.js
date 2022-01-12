const AWS = require('aws-sdk');
let connected = [];
let apigwManagementApi;
const sender= async (postData,currID)=>{
    console.log({connected,postData});
    const postCalls = connected.map(async (connectionId) => {
        try {
            if(connectionId!=currID)
                await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: postData }).promise();
        } catch (e) {
          if (e.statusCode === 410) {
            console.log(`Found stale connection, deleting ${connectionId}`);
            let disconnected = connectionId;
            connected = connected.filter((ele)=>ele!=disconnected);
          } else {
            console.log(e);
          }
        }
    });
    
    try {
        await Promise.all(postCalls);
    } catch (e) {
        console.log(e);
    }
}


exports.handler = async (event) => {
    if(!apigwManagementApi)
        apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
        });
    
    if(event.requestContext.routeKey=="$connect"){
        connected.push(event.requestContext.connectionId);
        console.log(connected);
        let postData=JSON.stringify({name:"System",role:"sys",msg:"A User Connected, Total Users = "+connected.length});
        await sender(postData,event.requestContext.connectionId);
    }
    else if (event.requestContext.routeKey=="$disconnect"){
        let disconnected = event.requestContext.connectionId;
        connected = connected.filter((ele)=>ele!=disconnected);
        let postData=JSON.stringify({name:"System",role:"sys",msg:"A User Disconnected, Total Users = "+connected.length});
        await sender(postData,event.requestContext.connectionId);
        
    }else if(event.requestContext.routeKey=="send"){
        const postData = JSON.parse(event.body).data;
        await sender(postData,event.requestContext.connectionId);
    }
    const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};
