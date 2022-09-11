import { config } from 'dotenv';
import { from } from 'rxjs';
config();
import { Router } from 'express';
const router = Router();
import PushMessage from '../models/push-message.js';
import webPush from 'web-push';
import AppDAO from '../dao.js';
import { DeliveryClient } from '@kontent-ai/delivery-sdk';
const publicVapidKey = process.env.vapidPublicKey;
const privateVapidKey = process.env.vapidPrivateKey;

const { setVapidDetails, sendNotification } = webPush;

router.post('/push', (req, res) => {
  const message = new PushMessage(req);
  if(message.hasValidSignature()) {
    processWebHook(message);
      console.log('Webhook - success');
      res.status(200).send('SUCCESS');
  }
  else {
      console.log('Webhook - invalid signature');
      res.status(403).send('INVALID SIGNATURE');
  }
});

const processWebHook = (message) => {
    const updatedVariantContentID = message.items[0].id;
    const deliveryClient = new DeliveryClient({
      projectId: message.projectId,
      globalQueryConfig:  {
        waitForLoadingNewContent: true
      }
    });

    const sub = from(deliveryClient.items()
                              .equalsFilter('system.id', updatedVariantContentID)
                              .toPromise())
                              .subscribe(result => {
                                sub.unsubscribe();
                                if(result.data.items.length > 0 && result.data.items[0].system.type == 'push_notification') {
                                  sendPush(result.data.items[0]);
                                }
                              });
};


const sendPush = function(item) {
  const payload = JSON.stringify({
    title: item.title.value,
    body: item.body.value,
    icon: item.icon.value[0].url,
    vibrate: item.vibrate.value.length > 0,
    url: item.url.value
  });

  setVapidDetails('mailto:support@kentico.com', publicVapidKey, privateVapidKey);
  const dao = new AppDAO();
  dao.getAllSubscriptions().then((rows) => {

    rows.forEach((row) => {
      //Row contains sub data in flat structure, but webpush expects {endpoint,keys{auth,p256dh}}
      let sub = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      sendNotification(sub, payload).catch(response => {
        if(response.statusCode === 410) {
          //Subscription expired or removed- delete from db
          dao.deleteSubscription(sub);
          console.log(`Subscription ${sub.keys.p256dh} deleted`);
        }
      });
    });
  });
}
    
export default router;
