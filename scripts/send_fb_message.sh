curl -X POST -H "Content-Type: application/json" -d '{    
  "messages": [
    {
      "attachment":{
        "type":"template",
        "payload":{
          "template_type":"generic",
          "elements":[
             {
              "title":"Welcome to Our Marketplace!",
              "image_url":"https://www.facebook.com/jaspers.png",
              "subtitle":"Fresh fruits and vegetables. Yum.",
              "buttons":[
                {
                  "type":"web_url",
                  "url":"https://www.jaspersmarket.com",
                  "title":"View Website"
                }              
              ]      
            }
          ]
        }       
      }
    }
  ]
}' "https://graph.facebook.com/v2.11/me/message_creatives?access_token=EAACBqkZBQO84BAM09V3bxZCBTZCV2zZAtwHZAovQEPlS4AzJRWU6mojMlySisZCFL4vOKmiBl5FIIFMM4MkgUlrQK1xhszx1MigipxPCzqiZAFrOS5wO7NAbyjKiK5ttpLUZAmgqkyblUdBQJVAaLxl56WIFHuFmY49vOQjjTWemUQZDZD"