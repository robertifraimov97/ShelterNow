import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

const submittedShelters = [
  {
    id: 1,
    name: 'Neighborhood Basement Shelter',
    address: '12 Herzl St, Tel Aviv',
    source: 'Community submission',
    status: 'Pending review',
  },
  {
    id: 2,
    name: 'Parking Level Safe Room',
    address: '8 Bialik St, Ramat Gan',
    source: 'Community submission',
    status: 'Approved in prototype',
  },
];

export default function MySubmittedSheltersScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>My Submitted Shelters</Text>
          <Text style={styles.subtitle}>
            View shelters you added to the community database
          </Text>
        </View>

        <View style={styles.listSection}>
          {submittedShelters.map((shelter) => (
                <View key={shelter.id} style={styles.shelterCard}>
                <Text style={styles.shelterName}>{shelter.name}</Text>
                <Text style={styles.shelterInfo}>{shelter.address}</Text>
                <Text style={styles.shelterInfo}>{shelter.source}</Text>

                <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{shelter.status}</Text>
                </View>

                <View style={styles.actionsRow}>
                    <Pressable
                        style={styles.editButton}
                        onPress={() => router.push('/edit-submitted-shelter')}>
                        <Text style={styles.editButtonText}>Edit</Text>
                    </Pressable>

                    <Pressable
                        style={styles.deleteButton}
                        onPress={() => console.log('Delete pressed', shelter.id)}>
                        <Text style={styles.deleteButtonText}>Delete</Text>
                    </Pressable>
                </View>
            </View>
          ))}
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
    paddingBottom: 24,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
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
  listSection: {
    gap: 12,
  },
  shelterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  shelterName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  shelterInfo: {
    fontSize: 14,
    color: '#64748B',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#E8F1FB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    editButton: {
      backgroundColor: '#E8F1FB',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    editButtonText: {
      color: '#1D4ED8',
      fontSize: 14,
      fontWeight: '700',
    },
    deleteButton: {
      backgroundColor: '#FEE2E2',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    deleteButtonText: {
      color: '#B91C1C',
      fontSize: 14,
      fontWeight: '700',
    },
});
