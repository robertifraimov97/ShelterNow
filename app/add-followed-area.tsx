import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { israeliCities } from '../data/israeli-cities';
import { addFollowedArea } from '../data/followed-areas-data';

export default function AddFollowedAreaScreen() {
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  const filteredCities = useMemo(() => {
    if (!searchText.trim()) {
      return israeliCities.slice(0, 8);
    }

    return israeliCities.filter((city) =>
      city.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [searchText]);

  const handleAddArea = () => {
    if (!selectedCity) {
      console.log('No city selected');
      return;
    }

    const added = addFollowedArea(selectedCity);

    if (!added) {
      console.log('Area already exists');
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Back to Followed Areas</Text>
          </Pressable>

          <Text style={styles.title}>Add Followed Area</Text>
          <Text style={styles.subtitle}>
            Search and select an area you want to monitor
          </Text>
        </View>

        <View style={styles.searchSection}>
          <Text style={styles.inputLabel}>Search City</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Type a city name"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>Matching Areas</Text>

          {filteredCities.map((city) => {
            const isSelected = selectedCity === city.name;

            return (
              <Pressable
                key={city.id}
                style={[
                  styles.cityItem,
                  isSelected && styles.cityItemSelected,
                ]}
                onPress={() => setSelectedCity(city.name)}>
                <Text
                  style={[
                    styles.cityName,
                    isSelected && styles.cityNameSelected,
                  ]}>
                  {city.name}
                </Text>
                <Text style={styles.cityCode}>Code: {city.cityCode}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[
            styles.addButton,
            !selectedCity && styles.addButtonDisabled,
          ]}
          onPress={handleAddArea}
          disabled={!selectedCity}>
          <Text style={styles.addButtonText}>Add Area</Text>
        </Pressable>
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
  searchSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D9E6',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  resultsSection: {
    gap: 12,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  cityItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  cityItemSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  cityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  cityNameSelected: {
    color: '#1D4ED8',
  },
  cityCode: {
    fontSize: 13,
    color: '#64748B',
  },
  addButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
