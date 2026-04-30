# ShelterNow

ShelterNow is a mobile emergency support prototype designed to help users quickly identify nearby protected areas during emergency situations.

The goal of the system is to present clear and simple guidance under stress, while combining shelter information, map based browsing, alerts, and user preferences in one application.

## Current Prototype Features

The current prototype includes the following screens and flows:

- **Home Screen**
  - Displays current status
  - Highlights the nearest shelter
  - Includes a quick map preview

- **Map Screen**
  - Displays an embedded map
  - Presents nearby shelter options
  - Allows access to a full screen map view
  - Includes access to a full shelters list

- **Full Map View**
  - Displays the map in a dedicated full screen layout

- **Shelters List**
  - Displays a larger list of available shelters
  - Includes a basic filter by source type:
    - All
    - Official
    - Community

- **Alerts Screen**
  - Displays current area alert status
  - Displays alerts for followed areas
  - Displays recent alerts

- **Profile Screen**
  - Serves as a profile and actions menu
  - Provides access to:
    - Profile Settings
    - Add Community Shelter

- **Profile Settings**
  - Allows the user to adjust:
    - Physical condition
    - Accessibility preference

- **Add Community Shelter**
  - Allows the user to submit a new shelter through a simple form

## Technologies Used

- React Native
- Expo
- Expo Router
- React Native Maps

## Prototype Scope

This repository currently represents a **functional prototype** of the client side application.

At this stage:
- the navigation structure is implemented
- the main screens and flows are working
- several features still rely on mock data
- backend integration, real time alerts, persistent storage, and recommendation logic are planned for future development

## Purpose

The prototype was built to validate the application structure, navigation flow, and user experience before full backend integration and advanced system logic are added.
