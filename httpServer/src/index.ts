import * as Hapi from '@hapi/hapi';
import { TestRepository } from './Repositories/TestRepository';
// eslint-disable-next-line no-unused-vars
import { IValuesRepository } from './Repositories/IValuesRepository';
import { MongoValuesRepository } from './Repositories/MongoValuesRepository';
import * as fs from 'fs';
// eslint-disable-next-line no-unused-vars
import { ISettingsRepository } from './Repositories/ISettingsRepository';
import { TestSettingsRepository } from './Repositories/TestSettingsRepository';
import { MongoSettingsRepository } from './Repositories/MongoSettingsRepository';
import { SettingsController } from './Controllers/SettingsController';
// eslint-disable-next-line no-unused-vars
import { ILogEntriesRepository } from './Repositories/ILogEntriesRepository';
import { TestLogEntriesRepository } from './Repositories/TestLogEntriesRepository';
import { MongoLogEntriesRepository } from './Repositories/MongoLogEntriesRepository';
import { LogEntriesController } from './Controllers/LogEntriesController';
// eslint-disable-next-line no-unused-vars
import { MongoClient, Db } from 'mongodb';
import { PatientInfoController } from './Controllers/PatientInfoController';
import EventsController from './Controllers/EventsController';
import { ValuesController } from './Controllers/ValuesController';
import AlarmsController from './Controllers/AlarmsController';

/* define configuration */

const envData = fs.readFileSync('env.json', 'utf-8');
let environment = JSON.parse(envData);

if (fs.existsSync('env-local.json')) {
    const envLocalData = fs.readFileSync('env-local.json', 'utf-8');
    const environmentLocal = JSON.parse(envLocalData);
    environment = { ...environment, ...environmentLocal };
}

// get the environment variables from eg Docker
environment = {
    DatabaseName: process.env.DatabaseName ?? environment.DatabaseName,
    DatabaseHost: process.env.DatabaseHost ?? environment.DatabaseHost,
    DatabasePort: parseInt(process.env.DatabasePort) || environment.DatabasePort,
    RepositoryMode: process.env.RepositoryMode ?? environment.RepositoryMode,
    WatchMode: process.env.WatchMode ?? environment.WatchMode,
    Port: parseInt(process.env.Port) || environment.Port,
    ListenInterface: process.env.ListenInterface ?? environment.ListenInterface,
    UpdateRate: parseInt(process.env.UpdateRate) || environment.UpdateRate,
    ServerMode: process.env.ServerMode ?? environment.ServerMode,
};

const host = environment.ListenInterface;
const port = environment.Port;

let mongoClient: MongoClient;

if (environment.RepositoryMode !== 'test') {
    let connectionString = `mongodb://${environment.DatabaseHost}:${environment.DatabasePort}/`;

    if (environment.WatchMode) {
        connectionString += '?connect=direct;replicaSet=rs0;readPreference=primaryPreferred';
    }

    mongoClient = new MongoClient(connectionString, { useUnifiedTopology: true, useNewUrlParser: true, poolSize: 15 });
}

const valuesRepositoryFactory = function (): IValuesRepository {
    let repository: IValuesRepository = null;

    if (environment.RepositoryMode === 'test') {
        repository = new TestRepository();
    } else {
        repository = new MongoValuesRepository(mongoClient);
    }

    return repository;
};

const testSettingsRepository = new TestSettingsRepository();
let mongoSettingsRepository = null;
const settingsRepositoryFactory = function (): ISettingsRepository {
    let repository: ISettingsRepository = null;

    if (environment.RepositoryMode === 'test') {
        repository = testSettingsRepository;
    } else {
        // we buffer settings, so make sure to always return the same instance
        if (mongoSettingsRepository === null) {
            mongoSettingsRepository = new MongoSettingsRepository(mongoClient);
        }

        repository = mongoSettingsRepository;
    }

    return repository;
};

const testLogEntriesRepository = new TestLogEntriesRepository();
const logsRepositoryFactory = function (): ILogEntriesRepository {
    let repository: ILogEntriesRepository = null;
    if (environment.RepositoryMode === 'test') {
        repository = testLogEntriesRepository;
    } else {
        repository = new MongoLogEntriesRepository(mongoClient);
    }

    return repository;
};

const getServer = async function () {
    const server: Hapi.Server = new Hapi.Server({
        host,
        port,
        routes: {
            cors: true,
        },
    });

    await server.register([require('@hapi/inert'),
        require('@hapi/nes'),
        require('hapijs-status-monitor'),
        {
            plugin: require('./plugins/LoggingPlugin'),
            options: {
                logsRepository: logsRepositoryFactory(),
            },
        }]);

    // get our mongodb connection ready
    if (environment.RepositoryMode !== 'test') {
        await mongoClient.connect();
    }

    server.log(['info'], {
        text: 'Server startup with environment variables set to: ' + JSON.stringify(environment, null, '\t'),
        source: 'Node.js',
        severity: 'info',
    });

    return server;
};

const startSlave = async function () {
    const server = await getServer();
    server.log(['debug'], {
        text: 'Start server in slave mode.',
        source: 'Node.js',
        severity: 'debug',
    });

    /* define routes */
    server.route({
        method: 'GET',
        path: '/{param*}',
        handler: {
            directory: {
                path: './ui/out',
                index: ['index.html', 'default.html'],
                listing: false,
            },
        },
    });

    server.route({
        method: 'GET',
        path: '/api/measured_values',
        handler: (request: Hapi.Request, h: Hapi.ResponseToolkit) => new ValuesController(valuesRepositoryFactory(), 'measured_values').HandleGet(request, h),
    });

    const broadcastSettings = (settings: any): void => {
        server.publish('/api/settings', settings);
    };

    server.route({
        method: 'GET',
        path: '/api/settings',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => await new SettingsController(settingsRepositoryFactory(),
            valuesRepositoryFactory(),
            broadcastSettings).HandleGet(request, h),
    });

    server.route({
        method: 'PUT',
        path: '/api/settings',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => await new SettingsController(settingsRepositoryFactory(),
            valuesRepositoryFactory(),
            broadcastSettings).HandlePut(request, h),
    });

    server.route({
        method: 'GET',
        path: '/api/patient_info',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => await new PatientInfoController(settingsRepositoryFactory()).HandleGet(request, h),
    });

    server.route({
        method: 'PUT',
        path: '/api/patient_info',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => await new PatientInfoController(settingsRepositoryFactory()).HandlePut(request, h),
    });

    server.route({
        method: 'GET',
        path: '/api/logs',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => await new LogEntriesController(logsRepositoryFactory()).HandleGet(request, h),
    });

    server.route({
        method: 'PUT',
        path: '/api/logs',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => await new LogEntriesController(logsRepositoryFactory()).HandlePut(request, h),
    });

    server.route({
        method: 'GET',
        path: '/api/events',
        handler: (request: Hapi.Request, h: Hapi.ResponseToolkit) => new EventsController(valuesRepositoryFactory()).HandleGet(request, h),
    });

    server.route({
        method: 'GET',
        path: '/api/alarms',
        handler: (request: Hapi.Request, h: Hapi.ResponseToolkit) => new AlarmsController(valuesRepositoryFactory()).HandleGet(request, h),
    });

    server.route({
        method: 'PUT',
        path: '/api/alarms',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
            const newAlarmValue = request.payload;
            const alarm = {
                data: newAlarmValue,
                type: 'alarm',
                reset: false,
                loggedAt: new Date(),
            };

            server.publish('/api/alarms', alarm);

            try {
                const valuesRepository = valuesRepositoryFactory();
                valuesRepository.InsertValue('events', alarm);
            } catch (exception) {}

            return {
                result: true,
            };
        },
    });

    server.route({
        method: 'GET',
        path: '/api/servertime',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
            return { time: new Date().getTime() };
        },
    });

    server.route({
        method: 'PUT',
        path: '/api/calculated_values',
        handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
            server.publish('/api/calculated_values', request.payload);
            return {
                result: true,
            };
        },
    });

    server.subscription('/api/measured_values');
    server.subscription('/api/settings');
    server.subscription('/api/alarms');
    server.subscription('/api/calculated_values');

    server.subscription('/api/servertime');

    await server.start();

    // start sending updates over websocket
    if (environment.RepositoryMode === 'test' || !environment.WatchMode) {
        const now = new Date();
        let lastDateTime = now;
        const valuesRepository = valuesRepositoryFactory();

        setInterval(async () => {
            const newValues = await valuesRepository.ReadValues('measured_values', lastDateTime, new Date(), {});

            if (newValues.length > 0) {
                server.publish('/api/measured_values', newValues);
                lastDateTime = newValues[newValues.length - 1].loggedAt;
            }
        }, environment.UpdateRate);
    } else {
        if (!mongoClient.isConnected()) {
            await mongoClient.connect();
        }

        const db: Db = mongoClient.db('beademing');

        db.collection('measured_values').watch().on('change', data => {
            if (data.operationType === 'insert') {
                server.publish('/api/measured_values', [data.fullDocument]);
            }
        });
    }
};

const startMaster = async function () {
    const server = await getServer();
    server.log(['debug'], {
        text: 'Start server in master mode.',
        source: 'Node.js',
        severity: 'debug',
    });

    /* define routes */
    server.route({
        method: 'GET',
        path: '/{param*}',
        handler: {
            directory: {
                path: './uiWardOverview/out',
                index: ['index.html', 'default.html'],
                listing: false,
            },
        },
    });

    await server.start();
};

if (environment.ServerMode === 'slave') {
    startSlave();
} else {
    startMaster();
}
