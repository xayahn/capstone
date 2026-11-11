import type { AppCatalog, Parish, QueueService, SacramentService } from '../types/domain';

export const PARISHES: Parish[] = [
  {
    id: 'metropolitan-cathedral',
    name: 'Metropolitan Cathedral of San Fernando',
    clergy: [
      { id: 'clergy-dizon', name: 'Msgr. R. Dizon' },
      { id: 'fr-e-santos', name: 'Fr. E. Santos' },
    ],
    venueId: 'venue-cathedral-main',
    contact: {
      address: 'Consunji St., Brgy. Sto. Rosario, City of San Fernando, Pampanga (sample directory)',
      officeHours: 'Tue–Sat 8:00 AM – 12:00 NN, 1:30 PM – 5:00 PM; Sun 8:00 AM – 11:30 AM',
      phone: '+63 (045) 555-0101',
      email: 'office.cathedral@parishlink.test',
      description: 'Seat of the Archdiocese and mother church serving the downtown San Fernando community.',
    },
  },
  {
    id: 'san-guillermo',
    name: 'San Guillermo Parish',
    clergy: [{ id: 'clergy-manalo', name: 'Fr. A. Manalo' }],
    venueId: 'venue-sg-main',
    contact: {
      address: 'Cabambangan, Bacolor, Pampanga (sample directory)',
      officeHours: 'Tue–Sun 8:00 AM – 12:00 NN, 1:30 PM – 4:30 PM',
      phone: '+63 (045) 555-0102',
      email: 'office.sanguillermo@parishlink.test',
      description: 'Historic parish of Bacolor coordinating sacramental preparation and archive inquiries.',
    },
  },
  {
    id: 'sanctuario-san-jose',
    name: 'Sanctuario de San Jose Parish',
    clergy: [{ id: 'fr-j-cruz', name: 'Fr. J. Cruz' }],
    venueId: 'venue-sanctuario-san-jose',
    contact: {
      address: 'Brgy. San Jose, City of San Fernando, Pampanga (sample directory)',
      officeHours: 'Tue–Sat 8:30 AM – 12:00 NN, 1:30 PM – 5:00 PM',
      phone: '+63 (045) 555-0103',
      email: 'office.sanctuario@parishlink.test',
      description: 'Parish community dedicated to St. Joseph in the Vicariate of St. John Mary Vianney.',
    },
  },
  {
    id: 'sta-lucia',
    name: 'Sta. Lucia Parish',
    clergy: [{ id: 'clergy-pineda', name: 'Fr. M. Pineda' }],
    venueId: 'venue-sl-main',
    contact: {
      address: 'Brgy. Sta. Lucia, City of San Fernando, Pampanga (sample directory)',
      officeHours: 'Tue–Sat 8:00 AM – 12:00 NN, 1:00 PM – 4:30 PM',
      phone: '+63 (045) 555-0104',
      email: 'office.stalucia@parishlink.test',
      description: 'Parish office serving families of Brgy. Sta. Lucia and neighboring communities.',
    },
  },
  {
    id: 'sto-nino',
    name: 'Sto. Niño Parish',
    clergy: [{ id: 'fr-b-tolentino', name: 'Fr. B. Tolentino' }],
    venueId: 'venue-sto-nino',
    contact: {
      address: 'Brgy. Sto. Niño, City of San Fernando, Pampanga (sample directory)',
      officeHours: 'Tue–Sat 8:00 AM – 12:00 NN, 1:30 PM – 5:00 PM',
      phone: '+63 (045) 555-0105',
      email: 'office.stonino@parishlink.test',
      description: 'Parish community coordinating baptisms, confirmations, weddings, and pastoral care.',
    },
  },
  {
    id: 'san-isidro-labrador',
    name: 'San Isidro Labrador Parish',
    clergy: [{ id: 'fr-c-reyes', name: 'Fr. C. Reyes' }],
    venueId: 'venue-san-isidro-labrador',
    contact: {
      address: 'Brgy. San Isidro, Bacolor / San Fernando boundary, Pampanga (sample directory)',
      officeHours: 'Tue–Sat 8:30 AM – 12:00 NN, 1:30 PM – 4:30 PM',
      phone: '+63 (045) 555-0106',
      email: 'office.sanisidro@parishlink.test',
      description: 'Parish office assisting parishioners with sacramental scheduling and document review.',
    },
  },
  {
    id: 'st-joseph',
    name: 'St. Joseph Parish',
    clergy: [{ id: 'fr-d-lopez', name: 'Fr. D. Lopez' }],
    venueId: 'venue-st-joseph',
    contact: {
      address: 'City of San Fernando, Pampanga (sample directory)',
      officeHours: 'Tue–Sat 8:00 AM – 12:00 NN, 1:30 PM – 5:00 PM',
      phone: '+63 (045) 555-0107',
      email: 'office.stjoseph@parishlink.test',
      description: 'Parish community in the Vicariate of St. John Mary Vianney.',
    },
  },
  {
    id: 'our-lady-of-lourdes',
    name: 'Archdiocesan Shrine of Our Lady of Lourdes',
    clergy: [{ id: 'fr-n-ocampo', name: 'Fr. N. Ocampo' }],
    venueId: 'venue-our-lady-of-lourdes',
    contact: {
      address: 'Cabetican, Bacolor, Pampanga (sample directory)',
      officeHours: 'Tue–Sun 8:00 AM – 12:00 NN, 1:30 PM – 5:00 PM',
      phone: '+63 (045) 555-0108',
      email: 'office.lourdes@parishlink.test',
      description: 'Archdiocesan shrine welcoming pilgrims and parishioners for liturgies and sacraments.',
    },
  },
];

export const SACRAMENT_SERVICES: SacramentService[] = [
  {
    id: 'baptism',
    name: 'Baptism',
    shortDescription: 'Welcome a child into the faith community.',
    durationMinutes: 60,
    icon: 'droplet',
    requirements: [
      "Child's PSA Birth Certificate",
      "Parents' Marriage Certificate (if married in Church)",
      'Baptismal permission letter (if outside home parish)',
      'Godparent qualification form',
    ],
  },
  {
    id: 'wedding',
    name: 'Wedding',
    shortDescription: 'Begin the parish marriage preparation process.',
    durationMinutes: 90,
    icon: 'heart',
    requirements: [
      'PSA Birth Certificates (bride & groom)',
      'CENOMAR',
      'Baptismal & Confirmation Certificates',
      'Marriage License',
      'Pre-Cana Seminar Certificate',
      'Marriage Banns',
    ],
  },
  {
    id: 'confirmation',
    name: 'Confirmation',
    shortDescription: 'Request a schedule for the sacrament of Confirmation.',
    durationMinutes: 60,
    icon: 'cross',
    requirements: [
      'Baptismal Certificate',
      'Catechism / Confirmation Class Certificate',
    ],
  },
  {
    id: 'first_communion',
    name: 'First Communion',
    shortDescription: 'Prepare for a first reception of the Eucharist.',
    durationMinutes: 60,
    icon: 'sun',
    requirements: [
      'Baptismal Certificate',
      'Catechism Attendance Record',
    ],
  },
  {
    id: 'funeral',
    name: 'Funeral Mass',
    shortDescription: 'Coordinate a reverent funeral liturgy with the parish.',
    durationMinutes: 45,
    icon: 'flame',
    requirements: [
      'Death Certificate',
      'Certificate of Burial Permit',
      'Baptismal Certificate (deceased, if available)',
    ],
  },
];

export const QUEUE_SERVICES: QueueService[] = [
  'Baptism inquiry',
  'Wedding inquiry',
  'Document submission',
  'Certificate request',
  'General inquiry',
];

export const getParish = (id: Parish['id']) =>
  PARISHES.find((parish) => parish.id === id);

export const getService = (id: SacramentService['id']) =>
  SACRAMENT_SERVICES.find((service) => service.id === id);

export function applyCatalog(catalog: AppCatalog): void {
  if (catalog.parishes.length) PARISHES.splice(0, PARISHES.length, ...catalog.parishes);
  if (catalog.services.length) SACRAMENT_SERVICES.splice(0, SACRAMENT_SERVICES.length, ...catalog.services);
  if (catalog.queueServices.length) QUEUE_SERVICES.splice(0, QUEUE_SERVICES.length, ...catalog.queueServices);
}
