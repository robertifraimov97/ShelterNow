import { SafeAreaView, View, Text, StyleSheet, ScrollView } from 'react-native';

export default function AlertsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Emergency Alerts</Text>
          <Text style={styles.subtitle}>
            Track alerts in your area and in areas you follow
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.cardLabel}>Current Area</Text>
          <Text style={styles.statusValue}>No active alert</Text>
          <Text style={styles.cardInfo}>Tel Aviv</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Followed Areas</Text>

          <View style={styles.alertCard}>
            <Text style={styles.areaName}>Haifa</Text>
            <Text style={styles.alertStatusActive}>Active alert</Text>
            <Text style={styles.alertTime}>Updated 2 min ago</Text>
          </View>

          <View style={styles.alertCard}>
            <Text style={styles.areaName}>North District</Text>
            <Text style={styles.alertStatusCalm}>No active alert</Text>
            <Text style={styles.alertTime}>Updated 5 min ago</Text>
          </View>

          <View style={styles.alertCard}>
            <Text style={styles.areaName}>Jerusalem</Text>
            <Text style={styles.alertStatusCalm}>No active alert</Text>
            <Text style={styles.alertTime}>Updated 9 min ago</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Alerts</Text>

          <View style={styles.recentCard}>
            <Text style={styles.recentArea}>Ramat Gan</Text>
            <Text style={styles.recentTime}>18:42</Text>
          </View>

          <View style={styles.recentCard}>
            <Text style={styles.recentArea}>Ashdod</Text>
            <Text style={styles.recentTime}>17:55</Text>
          </View>

          <View style={styles.recentCard}>
            <Text style={styles.recentArea}>Be’er Sheva</Text>
            <Text style={styles.recentTime}>17:20</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  cardLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  statusValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#16A34A',
  },
  cardInfo: {
    fontSize: 15,
    color: '#475569',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  areaName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  alertStatusActive: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
  alertStatusCalm: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16A34A',
  },
  alertTime: {
    fontSize: 14,
    color: '#64748B',
  },
  recentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentArea: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  recentTime: {
    fontSize: 14,
    color: '#64748B',
  },
});
