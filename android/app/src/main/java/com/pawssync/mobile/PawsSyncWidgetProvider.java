package com.pawssync.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

public class PawsSyncWidgetProvider extends AppWidgetProvider {
    private static final String PREFERENCES_NAME = "CapacitorStorage";
    private static final String WIDGET_DATA_KEY = "pawssync_widget_data";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        String payload = preferences.getString(WIDGET_DATA_KEY, null);

        JSONObject data = new JSONObject();
        if (payload != null) {
            try {
                data = new JSONObject(payload);
            } catch (JSONException exception) {
                android.util.Log.e("PawsSyncWidget", "Stored widget data is not valid JSON.", exception);
            }
        }

        JSONObject weather = data.optJSONObject("weather");
        String city = weather == null ? "Tu zona" : weather.optString("city", "Tu zona");
        int separator = city.indexOf(',');
        if (separator > 0) {
            city = city.substring(0, separator).trim();
        }
        String icon = weather == null ? "⛅" : weather.optString("icon", "⛅");
        String temperature = weather == null || weather.isNull("temperature")
                ? "--° " + icon
                : weather.optString("temperature", "--") + "° " + icon;
        String advice = weather == null
                ? "Abre PawsSync para consultar el clima"
                : weather.optString("advice", "Clima no disponible");
        String appointment = data.optString("appointment", "Sin citas próximas");
        String walk = data.optString("walk", "Sin paseos registrados");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pawssync_widget);
            views.setTextViewText(R.id.widget_weather, city);
            views.setTextViewText(R.id.widget_temperature, temperature);
            views.setTextViewText(R.id.widget_weather_advice, advice);
            views.setTextViewText(R.id.widget_appointment, appointment);
            views.setTextViewText(R.id.widget_walk, walk);

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
