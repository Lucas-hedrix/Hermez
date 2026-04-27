import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { db } from '../firebase/config';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { faker } from '@faker-js/faker';

export default function SeedButton() {
  const [loading, setLoading] = useState(false);

  const seedDatabase = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const genders = ['man', 'woman', 'nonbinary', 'other'];
      const preferences = ['men', 'women', 'everyone'];

      // Create 10 dummy users
      for (let i = 0; i < 10; i++) {
        const gender = faker.helpers.arrayElement(genders);
        const sexType = gender === 'man' ? 'male' : gender === 'woman' ? 'female' : undefined;
        
        const photoURLs = [
          faker.image.avatar(),
          faker.image.urlLoremFlickr({ category: 'portrait' })
        ];

        const uid = faker.string.uuid();
        const userDocRef = doc(usersRef, uid);

        const userData = {
          name: faker.person.firstName(sexType),
          age: faker.number.int({ min: 18, max: 50 }),
          gender: gender,
          bio: faker.person.bio(),
          city: faker.location.city(),
          photoURLs: photoURLs,
          preference: faker.helpers.arrayElement(preferences),
          minAge: 18,
          maxAge: 55,
          profileComplete: true,
          lastActive: serverTimestamp(),
          createdAt: serverTimestamp(),
        };

        await setDoc(userDocRef, userData);
      }
      
      Alert.alert("Success", "Successfully seeded 10 dummy users!");
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to seed database. Check your Firestore rules.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity 
      onPress={seedDatabase} 
      disabled={loading}
      style={{
        backgroundColor: '#FF4B4B',
        padding: 15,
        borderRadius: 10,
        margin: 20,
        alignItems: 'center',
        marginTop: 50
      }}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={{ color: 'white', fontWeight: 'bold' }}>🌱 Seed Dummy Users</Text>
      )}
    </TouchableOpacity>
  );
}
