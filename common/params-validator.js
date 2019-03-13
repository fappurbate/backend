'use strict';

const BaseValidator = require('moleculer').Validator;
const { ValidationError } = require('moleculer').Errors;
const Validator = require('fastest-validator');
const { Stream } = require('stream');

class ParamsValidator extends BaseValidator {
	constructor() {
		super();

		this.validator = new Validator;
    this.validator.add('stream', value => value instanceof Stream);
	}

	compile(schema) {
		return this.validator.compile(schema);
	}

	validate(params, schema) {
		const result = this.validator.validate(params, schema);
		if (result !== true) {
			throw new ValidationError('Parameters validation error!', null, result);
    }

		return true;
	}
}
module.exports = ParamsValidator;
