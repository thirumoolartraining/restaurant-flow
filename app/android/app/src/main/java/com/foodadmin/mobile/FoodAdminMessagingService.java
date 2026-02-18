package com.foodadmin.mobile;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import android.media.AudioAttributes;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.RemoteMessage;

import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService;

import java.util.Map;

/**
 * Native Firebase Messaging Service that EXTENDS ReactNativeFirebaseMessagingService.
 *
 * By extending RNFirebase's service:
 *   - super.onMessageReceived() fires JS-side handlers (onMessage / setBackgroundMessageHandler)
 *   - super.onNewToken() fires JS-side token refresh
 *
 * This service REPLACES RNFirebase's default registration in the manifest
 * (tools:node="remove" on the original, this one registered in its place).
 *
 * In BACKGROUND / KILLED state: displays the notification natively via
 * Android NotificationManager — 100% reliable, no JS runtime needed.
 * Also calls super so JS handlers (badge count etc.) still run if possible.
 *
 * In FOREGROUND state: delegates to super only — the JS onMessage handler
 * in App.js already renders it via expo-notifications.
 */
public class FoodAdminMessagingService extends ReactNativeFirebaseMessagingService {

    private static final String TAG = "FoodAdminMsgSvc";
    private static final String DEFAULT_CHANNEL_ID = "default";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "onMessageReceived from: " + remoteMessage.getFrom());

        // Display native notification when app is NOT in foreground
        // (background or killed). This is the reliable path — no JS needed.
        if (!isAppInForeground()) {
            displayNotification(remoteMessage);
        }

        // Always forward to RNFirebase so JS handlers fire:
        //   Foreground → onMessage listener in App.js
        //   Background → setBackgroundMessageHandler in index.js (badge count)
        super.onMessageReceived(remoteMessage);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "onNewToken");
        // Forward to RNFirebase so JS-side token refresh works
        super.onNewToken(token);
    }

    // ────────────────────────────────────────────────────────────────────
    // Native notification display
    // ────────────────────────────────────────────────────────────────────

    private void displayNotification(RemoteMessage remoteMessage) {
        try {
            String title = null;
            String body = null;
            String channelId = DEFAULT_CHANNEL_ID;

            // 1. Try the notification payload first
            RemoteMessage.Notification notification = remoteMessage.getNotification();
            if (notification != null) {
                title = notification.getTitle();
                body = notification.getBody();
                String nc = notification.getChannelId();
                if (nc != null && !nc.isEmpty()) {
                    channelId = nc;
                }
            }

            // 2. Fallback to data payload (backend also sends title/body here)
            Map<String, String> data = remoteMessage.getData();
            if ((title == null || title.isEmpty()) && data.containsKey("title")) {
                title = data.get("title");
            }
            if ((body == null || body.isEmpty()) && data.containsKey("body")) {
                body = data.get("body");
            }
            if (data.containsKey("channelId")) {
                channelId = data.get("channelId");
            }

            // Nothing to display
            if (title == null && body == null) {
                Log.d(TAG, "No title/body in message — skipping display");
                return;
            }

            NotificationManager mgr =
                    (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (mgr == null) return;

            // 3. Ensure the notification channel exists (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ensureChannel(mgr, channelId);
            }

            // 4. Build the Intent that opens the app on tap
            Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (intent == null) {
                intent = new Intent();
            }
            // Use NEW_TASK + SINGLE_TOP only. Do NOT use CLEAR_TOP — with singleTask
            // launch mode it can cause the OS to destroy the task during cold start
            // from killed state, resulting in the app opening and immediately closing.
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            // Pass notification data as extras so the app can read them on tap
            for (Map.Entry<String, String> entry : data.entrySet()) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
            intent.putExtra("google.message_id", remoteMessage.getMessageId());

            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this,
                    (int) System.currentTimeMillis(),
                    intent,
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );

            // 5. Build & show the notification
            int smallIcon = getResources().getIdentifier(
                    "notification_icon", "drawable", getPackageName());
            if (smallIcon == 0) {
                // Fallback to app icon
                smallIcon = getApplicationInfo().icon;
            }

            NotificationCompat.Builder builder =
                    new NotificationCompat.Builder(this, channelId)
                            .setSmallIcon(smallIcon)
                            .setContentTitle(title != null ? title : "")
                            .setContentText(body != null ? body : "")
                            .setAutoCancel(true)
                            .setPriority(NotificationCompat.PRIORITY_MAX)
                            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                            .setDefaults(NotificationCompat.DEFAULT_ALL)
                            .setContentIntent(pendingIntent);

            // Use BigTextStyle for longer notification bodies
            if (body != null && body.length() > 40) {
                builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
            }

            int notificationId = remoteMessage.getMessageId() != null
                    ? remoteMessage.getMessageId().hashCode()
                    : (int) System.currentTimeMillis();

            mgr.notify(notificationId, builder.build());
            Log.d(TAG, "Native notification displayed: " + title);

        } catch (Exception e) {
            Log.e(TAG, "Failed to display native notification", e);
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────

    /**
     * Create the notification channel if it does not exist yet.
     * Matches the channels created by the JS side (pushNotifications.js / index.js)
     * so the behaviour is identical.
     */
    private void ensureChannel(NotificationManager mgr, String channelId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (mgr.getNotificationChannel(channelId) != null) return;

        String name;
        boolean bypassDnd = false;

        switch (channelId) {
            case "new-orders":
                name = "New Orders";
                bypassDnd = true;
                break;
            case "order-updates":
                name = "Order Updates";
                bypassDnd = true;
                break;
            case "orders":
                name = "Order Notifications";
                bypassDnd = true;
                break;
            case "delivery":
                name = "Delivery Notifications";
                break;
            default:
                name = "Default Notifications";
                break;
        }

        NotificationChannel channel = new NotificationChannel(
                channelId, name, NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setShowBadge(true);

        // Explicitly set the default notification sound — without this the
        // channel is created silently and Android will NEVER let the JS side
        // update it later (channel settings are immutable once created).
        channel.setSound(
                Settings.System.DEFAULT_NOTIFICATION_URI,
                new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build()
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        }
        if (bypassDnd) {
            channel.setBypassDnd(true);
        }

        mgr.createNotificationChannel(channel);
        Log.d(TAG, "Created notification channel: " + channelId);
    }

    /**
     * Check whether the app's UI is currently visible to the user.
     */
    private boolean isAppInForeground() {
        try {
            ActivityManager.RunningAppProcessInfo appProcessInfo =
                    new ActivityManager.RunningAppProcessInfo();
            ActivityManager.getMyMemoryState(appProcessInfo);
            return appProcessInfo.importance
                    == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
        } catch (Exception e) {
            return false;
        }
    }
}
