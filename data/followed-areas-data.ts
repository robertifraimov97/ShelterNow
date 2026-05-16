export type FollowedArea = {
  id: number;
  name: string;
  status: string;
};

export let followedAreasData: FollowedArea[] = [
  {
    id: 1,
    name: 'Tel Aviv',
    status: 'Active monitoring',
  },
  {
    id: 2,
    name: 'Haifa',
    status: 'Active monitoring',
  },
  {
    id: 3,
    name: 'Jerusalem',
    status: 'Family area',
  },
];

export const addFollowedArea = (name: string) => {
  const alreadyExists = followedAreasData.some((area) => area.name === name);

  if (alreadyExists) {
    return false;
  }

  followedAreasData = [
    ...followedAreasData,
    {
      id: Date.now(),
      name,
      status: 'Active monitoring',
    },
  ];

  return true;
};

export const removeFollowedArea = (id: number) => {
  followedAreasData = followedAreasData.filter((area) => area.id !== id);
};
