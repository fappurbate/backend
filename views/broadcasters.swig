{% extends 'layout.swig' %}

{% block title %}Broadcasters - Kothique Chaturbate Backend{% endblock %}

{% block content %}
  <div class="title">Broadcasters</div>

  <a href="/">home</a>

  <ul>
    {% for broadcaster in broadcasters %}
      <li><a href="/{{ broadcaster.username }}">{{ broadcaster.username }}</a></li>
    {% endfor %}
  </ul>
{% endblock %}
