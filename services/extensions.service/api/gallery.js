const EventEmitter = require('events');
const ivm = require('isolated-vm');

module.exports.createGalleryAPI = function createGalleryAPI(data) {
  const { id, name, version, broadcaster, logger, logError,
    callAction, emitEvent, events, requests } = data;

  const eventHandlers = new EventEmitter;

  const meta = { events };

  events.on('gallery-add', meta.galleryAddListener = payload => {
    const { file } = payload;

    eventHandlers.emit('add', file);
  });

  events.on('gallery-remove', meta.galleryRemoveListener = payload => {
    const { file } = payload;

    eventHandlers.emit('remove', file);
  });

  return {
    api: {
      onAdd: {
        addListener: new ivm.Reference(cbRef => {
          eventHandlers.on('add', file => cbRef.apply(
            undefined,
            [new ivm.ExternalCopy(file).copyInto()]
          ).catch(logError));
        })
      },
      onRemove: {
        addListener: new ivm.Reference(cbRef => {
          eventHandlers.on('remove', file => cbRef.apply(
            undefined,
            [new ivm.ExternalCopy(file).copyInto()]
          ).catch(logError));
        })
      },
      playAudio: new ivm.Reference(id => callAction('gateway.ext.broadcast', {
        subject: 'play-audio',
        data: { id }
      }))
    },
    meta
  };
};

module.exports.disposeGalleryAPI = function disposeGalleryAPI(meta) {
  meta.events.off('gallery-remove', meta.galleryRemoveListener);
  meta.events.off('gallery-add', meta.galleryAddListener);
};
