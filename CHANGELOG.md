# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* Support for multiple events for each topics on the kafka retry consumer
* Support for global diffusion enabled by default on the kafka producer

### Changed

* Bump dependencies
* Remove Travis CI - [products/#97](https://github.com/ripe-tech/products/issues/97)

### Fixed

* Fix eslint dependencies problems

## [0.5.0] - 2021-11-22

### Added

* Allow callbacks for each event of each topic so that it is possible to subscribe to the same topic for different events
* Added `override` option to override the previous callbacks made for a topic subscription

## [0.4.3] - 2021-05-31

### Changed

* Improved error logging
