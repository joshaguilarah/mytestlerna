'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _os = require('os');

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _flatten = require('lodash/flatten');

var _flatten2 = _interopRequireDefault(_flatten);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _semver = require('semver');

var _semver2 = _interopRequireDefault(_semver);

var _writeJsonFile = require('write-json-file');

var _writeJsonFile2 = _interopRequireDefault(_writeJsonFile);

var _writePkg = require('write-pkg');

var _writePkg2 = _interopRequireDefault(_writePkg);

var _Command2 = require('lerna/lib/Command');

var _Command3 = _interopRequireDefault(_Command2);

var _ChildProcessUtilities = require('lerna/lib/ChildProcessUtilities');

var _ChildProcessUtilities2 = _interopRequireDefault(_ChildProcessUtilities);

var _GitUtilities = require('lerna/lib/GitUtilities');

var _GitUtilities2 = _interopRequireDefault(_GitUtilities);

var _NpmUtilities = require('lerna/lib/NpmUtilities');

var _NpmUtilities2 = _interopRequireDefault(_NpmUtilities);

var _output = require('lerna/lib/utils/output');

var _output2 = _interopRequireDefault(_output);

var _PackageUtilities = require('lerna/lib/PackageUtilities');

var _PackageUtilities2 = _interopRequireDefault(_PackageUtilities);

var _PromptUtilities = require('lerna/lib/PromptUtilities');

var _PromptUtilities2 = _interopRequireDefault(_PromptUtilities);

var _UpdatedPackagesCollector = require('lerna/lib/UpdatedPackagesCollector');

var _UpdatedPackagesCollector2 = _interopRequireDefault(_UpdatedPackagesCollector);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * This is a utility class used to handle publishing for the Allhomes mono repos using "fixed mode" versioning.
 * <p>
 * This custom publish handler solves the issue where a `lerna publish` does not regenerate the `yarn.lock` file
 * with the new tarballs for linked dependencies.
 * <p>
 * NOTE: This class assumes the npm client is yarn and will fail if otherwise.
 * <p>
 * Example usage for node cli script:
 * ```
 * #!/usr/bin/env node
 * import { PublishCommand } from '@domain-group/fe-allhomes-library';
 * const publishCommand = new PublishCommand([], {}, __dirname);
 * let exitCode;
 * publishCommand.run().then((result) => {
 *   exitCode = result.exitCode;
 * }).catch((error) => {
 *   exitCode = result.exitCode;
 * });
 * process.exit(exitCode);
 * ```
 */
var PublishCommand = function (_Command) {
  _inherits(PublishCommand, _Command);

  function PublishCommand() {
    _classCallCheck(this, PublishCommand);

    return _possibleConstructorReturn(this, (PublishCommand.__proto__ || Object.getPrototypeOf(PublishCommand)).apply(this, arguments));
  }

  _createClass(PublishCommand, [{
    key: 'initialize',
    value: function initialize(callback) {
      var _this2 = this;

      this.npmRegistry = 'https://registry.npmjs.org/';
      this.npmClient = this.options.npmClient;
      this.gitRemote = 'origin';
      this.globalVersion = this.repository.version;
      this.logger.info('current version', this.globalVersion);

      if (_GitUtilities2.default.isDetachedHead(this.execOpts)) {
        throw new _Command2.ValidationError('ENOGIT', 'Detached git HEAD, please checkout a branch to publish changes.');
      }

      this.updates = new _UpdatedPackagesCollector2.default(this).getUpdates();
      this.packagesToPublish = this.updates.map(function (update) {
        return update.package;
      }).filter(function (pkg) {
        return !pkg.isPrivate();
      });
      this.packagesToPublishCount = this.packagesToPublish.length;
      try {
        // This will sort the packages according to the dependency structure (ie. dependencies go before dependents)
        this.sortedPackagesToPublish = (0, _flatten2.default)(_PackageUtilities2.default.topologicallyBatchPackages(this.packagesToPublish, {
          depsOnly: true,
          rejectCycles: true
        }));
      } catch (error) {
        callback(error);
        return;
      }

      if (!this.updates.length) {
        this.logger.info('No updated packages to publish.');
        callback(null, false);
        return;
      }

      this.getVersionsForUpdates(function (error, version) {
        if (error) {
          callback(error);
          return;
        }
        var versions = {};
        _this2.updates.forEach(function (update) {
          versions[update.package.name] = version;
        });
        _this2.masterVersion = version;
        _this2.updatesVersions = versions;
        _this2.confirmVersions(callback);
      });
    }
  }, {
    key: 'execute',
    value: function execute(callback) {
      var _this3 = this;

      this.updateVersionInLernaJson();
      this.publishPackagesToNpm(function (error) {
        if (error) {
          callback(error);
          return;
        }
        _this3.gitCommitTagAndPush();
        var message = _this3.packagesToPublish.map(function (pkg) {
          return ' - ' + pkg.name + '@' + pkg.version;
        });
        (0, _output2.default)('Successfully published:');
        (0, _output2.default)(message.join(_os.EOL));
        _this3.logger.success('publish', 'finished');
        callback(null, true);
      });
    }
  }, {
    key: 'updateVersionInLernaJson',
    value: function updateVersionInLernaJson() {
      this.repository.lernaJson.version = this.masterVersion;
      _writeJsonFile2.default.sync(this.repository.lernaJsonLocation, this.repository.lernaJson, { indent: 2 });

      if (!this.options.skipGit) {
        _GitUtilities2.default.addFile(this.repository.lernaJsonLocation, this.execOpts);
      }
    }
  }, {
    key: 'publishPackagesToNpm',
    value: function publishPackagesToNpm(callback) {
      var _this4 = this;

      this.logger.info('publish', 'Publishing packages to npm in topological order...');
      try {
        this.sortedPackagesToPublish.forEach(function (pkg) {
          _this4.updatePackage(pkg);
          var publishResult = _this4.npmPublish(pkg);
          if (!publishResult.success) {
            throw new Error(publishResult.error);
          }
        });
      } catch (error) {
        callback(error);
        return;
      }
      callback();
    }
  }, {
    key: 'updatePackage',
    value: function updatePackage(pkg) {
      var _this5 = this;

      var changedFiles = [];
      var packageLocation = pkg.location;
      var packageJsonLocation = _path2.default.join(packageLocation, 'package.json');
      var yarnLockLocation = _path2.default.join(packageLocation, 'yarn.lock');

      // Set new version
      // eslint-disable-next-line no-param-reassign
      pkg.version = this.updatesVersions[pkg.name] || pkg.version;

      // Update pkg dependencies
      this.updatePackageDepsObject(pkg, 'dependencies');
      this.updatePackageDepsObject(pkg, 'devDependencies');
      this.updatePackageDepsObject(pkg, 'peerDependencies');

      // Run the preversion script
      this.runSyncScriptInPackage(pkg, 'preversion');

      // Write changes to package.json
      _writePkg2.default.sync(packageJsonLocation, pkg.toJSON());

      // Run the version script
      this.runSyncScriptInPackage(pkg, 'version');

      // Add the package.json file to list of files to be git committed
      changedFiles.push(packageJsonLocation);

      // Update the yarn.lock file for the package if updateYarnLock flag is enabled.
      // NOTE: This extra step might make the publish process take a bit longer than usual but we already
      // manually do the yarn.lock update as a separate step anyway which takes just as long.
      // eslint-disable-next-line no-underscore-dangle
      if (pkg._package.updateYarnLock) {
        this.logger.info('publish', 'Updating yarn.lock file for ' + pkg.name + '...');
        try {
          var opts = _NpmUtilities2.default.getExecOpts(pkg.location, this.npmRegistry);
          _ChildProcessUtilities2.default.execSync('yarn', ['install'], opts);
        } catch (error) {}
        // Fail silently


        // Add the yarn.lock file to list of files to be git committed
        changedFiles.push(yarnLockLocation);
      }

      // Add all changed files to be git committed
      changedFiles.forEach(function (file) {
        return _GitUtilities2.default.addFile(file, _this5.execOpts);
      });

      // Run the postversion script
      this.runSyncScriptInPackage(pkg, 'postversion');
    }
  }, {
    key: 'npmPublish',
    value: function npmPublish(pkg) {
      var _this6 = this;

      // Run the prepublish script
      this.runSyncScriptInPackage(pkg, 'prepublish');
      var attempts = 0;
      var run = function run() {
        var resultError = void 0;
        try {
          // Publish the package to the npm registry
          var opts = _NpmUtilities2.default.getExecOpts(pkg.location, _this6.npmRegistry);
          var stdout = _ChildProcessUtilities2.default.execSync('npm', ['publish', '--tag', 'latest'], opts);

          _this6.logger.info('publish', 'Publish succeeded', pkg.name, stdout.toString());

          // Run the postpublish script
          _this6.runSyncScriptInPackage(pkg, 'postpublish');

          return { success: true };
        } catch (error) {
          resultError = error;
          _this6.logger.error('publish', 'Publish failed', pkg.name, error.message);
        }

        attempts += 1;

        if (attempts < 5) {
          _this6.logger.error('publish', 'Retrying failed publish:', pkg.name);
          run();
        }
        return { success: false, error: resultError };
      };
      return run();
    }
  }, {
    key: 'getVersionsForUpdates',
    value: function getVersionsForUpdates(callback) {
      var promptVersion = function promptVersion(currentVersion, promptCallback) {
        // Not bothering with other version types as we only ever use patch, minor and major
        var patch = _semver2.default.inc(currentVersion, 'patch');
        var minor = _semver2.default.inc(currentVersion, 'minor');
        var major = _semver2.default.inc(currentVersion, 'major');
        var message = 'Select a new version (currently ' + currentVersion + ')';
        _PromptUtilities2.default.select(message, {
          choices: [{ value: patch, name: 'Patch (' + patch + ')' }, { value: minor, name: 'Minor (' + minor + ')' }, { value: major, name: 'Major (' + major + ')' }]
        }, function (choice) {
          promptCallback(null, choice);
        });
      };

      promptVersion(this.globalVersion, function (error, version) {
        if (error) {
          return callback(error);
        }
        return callback(null, version);
      });
    }
  }, {
    key: 'confirmVersions',
    value: function confirmVersions(callback) {
      var _this7 = this;

      var changes = this.updates.map(function (update) {
        var pkg = update.package;
        var line = ' - ' + pkg.name + ': ' + pkg.version + ' => ' + _this7.updatesVersions[pkg.name];
        if (pkg.isPrivate()) {
          line += ' (' + _chalk2.default.red('private') + ')';
        }
        return line;
      });

      (0, _output2.default)('');
      (0, _output2.default)('Changes:');
      (0, _output2.default)(changes.join(_os.EOL));
      (0, _output2.default)('');

      _PromptUtilities2.default.confirm('Are you sure you want to publish the above changes?', function (confirm) {
        callback(null, confirm);
      });
    }
  }, {
    key: 'runSyncScriptInPackage',
    value: function runSyncScriptInPackage(pkg, scriptName) {
      var _this8 = this;

      pkg.runScriptSync(scriptName, function (error) {
        if (error) {
          _this8.logger.error('publish', 'error running ' + scriptName + ' in ' + pkg.name + '\n', error.stack || error);
        }
      });
    }
  }, {
    key: 'updatePackageDepsObject',
    value: function updatePackageDepsObject(pkg, depsKey) {
      var _this9 = this;

      var deps = pkg[depsKey];
      if (!deps) {
        return;
      }
      this.packageGraph.get(pkg.name).dependencies.forEach(function (depName) {
        var version = _this9.updatesVersions[depName];
        if (deps[depName] && version) {
          deps[depName] = '^' + version;
        }
      });
    }
  }, {
    key: 'gitCommitTagAndPush',
    value: function gitCommitTagAndPush() {
      var tag = 'v' + this.masterVersion;
      _GitUtilities2.default.commit(tag, this.execOpts);
      _GitUtilities2.default.addTag(tag, this.execOpts);
      this.logger.info('git', 'Pushing tags...');
      _GitUtilities2.default.pushWithTags(this.gitRemote, [tag], this.execOpts);
    }
  }]);

  return PublishCommand;
}(_Command3.default);

exports.default = PublishCommand;