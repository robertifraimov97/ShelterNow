import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { API_BASE_URL } from '../constants/api';

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
     * Helps verify that Expo successfully
     * generated a Push Token for this device.
     */
    console.log(
        'Expo push token:',
        tokenData.data
    );

    /*
     * Register this device with the backend.
     *
     * Flow:
     *
     * Mobile App
     *   ↓
     * Expo Push Token
     *   ↓
     * POST /push/register
     *   ↓
     * FastAPI
     *   ↓
     * Neon PostgreSQL
     *
     * The backend stores the token so it can
     * later send emergency notifications
     * to this device.
     */
    const response = await fetch(
        `${API_BASE_URL}/push/register`,
        {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
            },

            body: JSON.stringify({
                token: tokenData.data,

                /*
                 * Device platform.
                 *
                 * Examples:
                 * iOS
                 * Android
                 *
                 * Useful for debugging,
                 * analytics and future filtering.
                 */
                platform: Device.osName ?? 'unknown',
            }),
        }
    );

    /*
     * Log backend registration result.
     */
    if (response.ok) {
        console.log(
            'Push token successfully registered.'
        );
    } else {
        console.log(
            'Failed to register push token.'
        );
    }

    /*
     * Return the token to the caller.
     *
     * Future:
     * The caller may use this token
     * for additional logic or debugging.
     */
    return tokenData.data;
}