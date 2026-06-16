import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

/*
 * Push Notifications Service
 *
 * Responsibility:
 * Register the device with Expo Push Notifications
 * and return an Expo Push Token.
 *
 * Future flow:
 *
 * App
 *  ↓
 * Request notification permission
 *  ↓
 * Get Expo Push Token
 *  ↓
 * Send token to Backend
 *  ↓
 * Backend stores token in DB
 *  ↓
 * Backend can send notifications to this device
 */

export async function registerForPushNotificationsAsync() {

    /*
     * Push notifications require a real device.
     *
     * Expo Go / simulators may not support
     * full push-notification functionality.
     */
    if (!Device.isDevice) {
        console.log('Push notifications require a physical device.');
        return null;
    }

    /*
     * Check current notification permission status.
     *
     * Example:
     * granted
     * denied
     * undetermined
     */
    const existingPermission =
        await Notifications.getPermissionsAsync();

    let finalStatus = existingPermission.status;

    /*
     * If permission was not already granted,
     * ask the user for notification permission.
     */
    if (finalStatus !== 'granted') {

        const requestedPermission =
            await Notifications.requestPermissionsAsync();

        finalStatus = requestedPermission.status;
    }

    /*
     * User denied notifications.
     *
     * We cannot receive a push token without permission.
     */
    if (finalStatus !== 'granted') {
        console.log(
            'Push notification permission was not granted.'
        );
        return null;
    }

    /*
     * Request Expo Push Token.
     *
     * Example:
     * ExponentPushToken[xxxxxxxxxxxxxxxx]
     *
     * This token uniquely identifies
     * the device inside Expo's push system.
     */
    const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

    if (!projectId) {
        console.log('Expo projectId was not found.');
        return null;
    }

    const tokenData =
        await Notifications.getExpoPushTokenAsync({
            projectId,
        });

    /*
     * Temporary development logging.
     *
     * Future:
     * Send token to backend API
     * and store it in Neon/PostgreSQL.
     */
    console.log(
        'Expo push token:',
        tokenData.data
    );

    return tokenData.data;
}