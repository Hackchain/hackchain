'use strict';

const assert = require('assert');

const hackchain = require('../');
const utils = hackchain.utils;

describe('utils', () => {
  describe('binarySearch', () => {
    const arr = [ 1, 2, 3, 4, 5, 6, 7 ];
    const cmp = (a, b) => {
      return a > b ? 1 : a < b ? -1 : 0;
    };

    it('should find the middle element', () => {
      assert.equal(utils.binarySearch(arr, 4, cmp), 3);
    });

    it('should find the first element', () => {
      assert.equal(utils.binarySearch(arr, 1, cmp), 0);
    });

    it('should find the last element', () => {
      assert.equal(utils.binarySearch(arr, 7, cmp), 6);
    });

    it('should find the middle-left element', () => {
      assert.equal(utils.binarySearch(arr, 3, cmp), 2);
    });

    it('should find the middle-right element', () => {
      assert.equal(utils.binarySearch(arr, 5, cmp), 4);
    });

    it('should find the non-existant middle-left element', () => {
      assert.equal(utils.binarySearch(arr, 3.5, cmp), 3);
    });

    it('should find the non-existant middle-right element', () => {
      assert.equal(utils.binarySearch(arr, 4.5, cmp), 4);
    });

    it('should find the non-existant first-left element', () => {
      assert.equal(utils.binarySearch(arr, 0.5, cmp), 0);
    });

    it('should find the non-existant first-right element', () => {
      assert.equal(utils.binarySearch(arr, 1.5, cmp), 1);
    });

    it('should find the non-existant last-left element', () => {
      assert.equal(utils.binarySearch(arr, 6.5, cmp), 6);
    });

    it('should find the non-existant last-right element', () => {
      assert.equal(utils.binarySearch(arr, 7.5, cmp), 7);
    });
  });
});
